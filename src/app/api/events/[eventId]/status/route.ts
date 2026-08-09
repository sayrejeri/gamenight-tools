import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { generateEventBracket } from "@/lib/bracket-generation";
import { bracketChampion, isDraft } from "@/components/bracket/bracket-model";
import { dispatchWorkspaceWebhooks, type WorkspaceWebhookNotification } from "@/lib/workspace-webhook-dispatch";

const actionSchema = z.object({
  action: z.enum(["PUBLISH", "SUBMIT_APPROVAL", "APPROVE", "CLOSE_SIGNUPS", "OPEN_CHECKIN", "START", "COMPLETE", "POSTPONE", "CANCEL", "REOPEN_DRAFT"]),
  reason: z.string().trim().max(1000).optional().default(""),
});

type EventRow = RowDataPacket & {
  id: string; workspace_id: string; workspace_name: string; name: string; game_label: string | null;
  starts_at: Date | null; timezone: string; status: string; primary_host_id: string; staff_approval_required: number;
  bracket_enabled: number; bracket_format: "SINGLE_ELIMINATION" | "THREE_PLAYER" | null;
  bracket_seeding_mode: "RANDOM" | "MANUAL" | null; bracket_auto_generate: number; bracket_require_check_in: number;
};

type CompletionBracketRow = RowDataPacket & {
  id: string;
  settings_json: string | null;
};

class TransitionConflict extends Error {}

const allowedFrom: Record<string, string[]> = {
  PUBLISH: ["DRAFT", "POSTPONED"], SUBMIT_APPROVAL: ["DRAFT", "POSTPONED"], APPROVE: ["AWAITING_APPROVAL"],
  CLOSE_SIGNUPS: ["SIGNUPS_OPEN"], OPEN_CHECKIN: ["SIGNUPS_OPEN", "SIGNUPS_CLOSED"], START: ["SIGNUPS_CLOSED", "CHECK_IN_OPEN"],
  COMPLETE: ["LIVE"], POSTPONE: ["DRAFT", "AWAITING_APPROVAL", "SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE"],
  CANCEL: ["DRAFT", "AWAITING_APPROVAL", "SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE", "POSTPONED"],
  REOPEN_DRAFT: ["POSTPONED", "CANCELLED"],
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event action." }, { status: 400 });
  const { eventId } = await context.params;
  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, w.name AS workspace_name, e.name,
            COALESCE(e.subgame_name, e.game_name, e.platform_name) AS game_label,
            e.starts_at, e.timezone, e.status, e.primary_host_id, e.staff_approval_required,
            e.bracket_enabled, e.bracket_format, e.bracket_seeding_mode,
            e.bracket_auto_generate, e.bracket_require_check_in
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const [workspaceManage, canApprove] = await Promise.all([
    hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_EVENTS"),
    hasWorkspacePermission(session.userId, event.workspace_id, "APPROVE_EVENTS"),
  ]);
  const isPrimaryHost = event.primary_host_id === session.userId;
  const canManage = isPrimaryHost || workspaceManage || cohost[0]?.permission_level === "FULL";
  if (!canManage) return NextResponse.json({ error: "You cannot manage this event." }, { status: 403 });

  const action = parsed.data.action;
  const reason = parsed.data.reason.trim();
  if (!allowedFrom[action]?.includes(event.status)) return NextResponse.json({ error: `That action is not available while the event is ${event.status.toLowerCase()}.` }, { status: 409 });
  if (action === "APPROVE" && !canApprove) return NextResponse.json({ error: "Event-approval permission is required." }, { status: 403 });
  if (action === "CANCEL" && reason.length < 2) return NextResponse.json({ error: "Enter a cancellation reason for participants." }, { status: 400 });

  let nextStatus: string;
  if (action === "PUBLISH") nextStatus = event.staff_approval_required && !canApprove ? "AWAITING_APPROVAL" : "SIGNUPS_OPEN";
  else nextStatus = { SUBMIT_APPROVAL: "AWAITING_APPROVAL", APPROVE: "SIGNUPS_OPEN", CLOSE_SIGNUPS: "SIGNUPS_CLOSED", OPEN_CHECKIN: "CHECK_IN_OPEN", START: "LIVE", COMPLETE: "COMPLETED", POSTPONE: "POSTPONED", CANCEL: "CANCELLED", REOPEN_DRAFT: "DRAFT" }[action] ?? event.status;

  let bracketResult: { generated: boolean; participantCount: number };
  try {
    bracketResult = await withTransaction(async (connection) => {
      let result = { generated: false, participantCount: 0 };
      if (["CLOSE_SIGNUPS", "OPEN_CHECKIN", "START"].includes(action) && event.bracket_enabled && event.bracket_auto_generate && event.bracket_format && event.bracket_seeding_mode) {
        result = await generateEventBracket(connection, { eventId, eventName: event.name, format: event.bracket_format, seedingMode: event.bracket_seeding_mode, requireCheckIn: Boolean(event.bracket_require_check_in) });
      }
      if (action === "START" && event.bracket_enabled) {
        const [brackets] = await connection.query<(RowDataPacket & { settings_json: string | null })[]>(`SELECT settings_json FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`, [eventId]);
        if (!brackets[0]?.settings_json) throw new TransitionConflict(event.bracket_seeding_mode === "MANUAL" ? "Place the approved participants and save the bracket before starting the event." : "The bracket could not be generated. Check that enough eligible participants are approved and checked in.");
      }
      if (action === "COMPLETE" && event.bracket_enabled) {
        const [brackets] = await connection.query<CompletionBracketRow[]>(
          `SELECT id, settings_json FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`,
          [eventId],
        );
        const bracket = brackets[0];
        if (!bracket?.settings_json) throw new TransitionConflict("Finish and save the tournament bracket before completing this event.");
        let bracketState: unknown = null;
        try { bracketState = JSON.parse(bracket.settings_json); } catch { bracketState = null; }
        if (!isDraft(bracketState) || !bracketChampion(bracketState)) {
          throw new TransitionConflict("Finish every required bracket match before completing this event.");
        }
      }
      await connection.execute(
        `UPDATE events SET status = ?, approved_by = IF(? = 'APPROVE', ?, approved_by),
             approved_at = IF(? = 'APPROVE', CURRENT_TIMESTAMP(3), approved_at),
             published_at = IF(? = 'SIGNUPS_OPEN' AND published_at IS NULL, CURRENT_TIMESTAMP(3), published_at),
             signups_closed_at = IF(? IN ('SIGNUPS_CLOSED', 'CHECK_IN_OPEN', 'LIVE'), CURRENT_TIMESTAMP(3), signups_closed_at),
             cancellation_reason = CASE WHEN ? = 'CANCEL' THEN ? WHEN ? = 'REOPEN_DRAFT' THEN NULL ELSE cancellation_reason END,
             cancelled_at = CASE WHEN ? = 'CANCEL' THEN CURRENT_TIMESTAMP(3) WHEN ? = 'REOPEN_DRAFT' THEN NULL ELSE cancelled_at END,
             updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [nextStatus, action, session.userId, action, nextStatus, nextStatus, action, reason || null, action, action, action, eventId],
      );
      if (action === "START" && event.bracket_enabled) await connection.execute(`UPDATE brackets SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP(3) WHERE event_id = ?`, [eventId]);
      if (action === "COMPLETE" && event.bracket_enabled) await connection.execute(`UPDATE brackets SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE event_id = ?`, [eventId]);
      return result;
    });
  } catch (error) {
    if (error instanceof TransitionConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: `event.status.${nextStatus.toLowerCase()}`, targetType: "event", targetId: eventId, details: { previousStatus: event.status, action, reason: reason || null, bracketResult } });

  if (action === "CANCEL") {
    const recipients = await query<(RowDataPacket & { user_id: string })[]>(
      `SELECT CAST(user_id AS CHAR) AS user_id FROM event_participants
       WHERE event_id = ? AND status IN ('PENDING', 'APPROVED', 'WAITLISTED')`,
      [eventId],
    );
    await Promise.allSettled(recipients.map((recipient) => getPool().execute(
      `INSERT INTO notifications (id, user_id, event_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, ?, 'EVENT_CANCELLED', 'EVENTS', ?, ?, ?)`,
      [randomUUID(), recipient.user_id, eventId, `${event.name} was cancelled`, reason, `/dashboard/events/${eventId}`],
    )));
  }

  const notificationByAction: Partial<Record<typeof action, WorkspaceWebhookNotification>> = {
    PUBLISH: nextStatus === "SIGNUPS_OPEN" ? "EVENT_PUBLISHED" : undefined,
    APPROVE: "EVENT_PUBLISHED", CLOSE_SIGNUPS: "SIGNUPS_CLOSED", OPEN_CHECKIN: "CHECK_IN_OPEN",
    START: "EVENT_LIVE", COMPLETE: "EVENT_COMPLETED", CANCEL: "EVENT_CANCELLED",
  };
  const notificationType = notificationByAction[action];
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (notificationType) {
    await dispatchWorkspaceWebhooks({
      workspaceId: event.workspace_id, eventId, notificationType,
      title: `${event.name} · ${nextStatus.replaceAll("_", " ")}`,
      description: `${event.workspace_name} updated this event.${event.game_label ? `\nGame: ${event.game_label}` : ""}${action === "CANCEL" ? `\nReason: ${reason}` : ""}`,
      url: appUrl ? `${appUrl}/dashboard/events/${eventId}` : null,
      fields: [
        { name: "Status", value: nextStatus.replaceAll("_", " "), inline: true },
        ...(event.starts_at ? [{ name: "Starts", value: `<t:${Math.floor(new Date(event.starts_at).getTime() / 1000)}:F>`, inline: true }] : []),
      ],
    });
  }
  if (bracketResult.generated) {
    await dispatchWorkspaceWebhooks({ workspaceId: event.workspace_id, eventId, notificationType: "BRACKET_PUBLISHED", title: `${event.name} bracket generated`, description: `${bracketResult.participantCount} eligible participants were placed into the bracket.`, url: appUrl ? `${appUrl}/dashboard/events/${eventId}` : null });
  }
  return NextResponse.json({ status: nextStatus, bracketResult });
}
