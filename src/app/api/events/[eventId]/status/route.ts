import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { generateEventBracket } from "@/lib/bracket-generation";

const actionSchema = z.object({
  action: z.enum([
    "PUBLISH",
    "SUBMIT_APPROVAL",
    "APPROVE",
    "CLOSE_SIGNUPS",
    "OPEN_CHECKIN",
    "START",
    "COMPLETE",
    "POSTPONE",
    "CANCEL",
    "REOPEN_DRAFT",
  ]),
});

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  primary_host_id: string;
  staff_approval_required: number;
  bracket_enabled: number;
  bracket_format: "SINGLE_ELIMINATION" | "THREE_PLAYER" | null;
  bracket_seeding_mode: "RANDOM" | "MANUAL" | null;
  bracket_auto_generate: number;
  bracket_require_check_in: number;
};

class TransitionConflict extends Error {}

const allowedFrom: Record<string, string[]> = {
  PUBLISH: ["DRAFT", "POSTPONED"],
  SUBMIT_APPROVAL: ["DRAFT", "POSTPONED"],
  APPROVE: ["AWAITING_APPROVAL"],
  CLOSE_SIGNUPS: ["SIGNUPS_OPEN"],
  OPEN_CHECKIN: ["SIGNUPS_OPEN", "SIGNUPS_CLOSED"],
  START: ["SIGNUPS_CLOSED", "CHECK_IN_OPEN"],
  COMPLETE: ["LIVE"],
  POSTPONE: ["DRAFT", "AWAITING_APPROVAL", "SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE"],
  CANCEL: ["DRAFT", "AWAITING_APPROVAL", "SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE", "POSTPONED"],
  REOPEN_DRAFT: ["POSTPONED", "CANCELLED"],
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event action." }, { status: 400 });

  const { eventId } = await context.params;
  const events = await query<EventRow[]>(
    `SELECT id, workspace_id, name, status, primary_host_id, staff_approval_required,
            bracket_enabled, bracket_format, bracket_seeding_mode,
            bracket_auto_generate, bracket_require_check_in
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const role = await getWorkspaceRole(session.userId, event.workspace_id);
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const isPrimaryHost = event.primary_host_id === session.userId;
  const canManage = isPrimaryHost || canManageCodes(role) || cohost[0]?.permission_level === "FULL";
  if (!canManage) return NextResponse.json({ error: "You cannot manage this event." }, { status: 403 });

  const action = parsed.data.action;
  if (!allowedFrom[action]?.includes(event.status)) {
    return NextResponse.json({ error: `That action is not available while the event is ${event.status.toLowerCase()}.` }, { status: 409 });
  }
  if (action === "APPROVE" && !canManageCodes(role)) {
    return NextResponse.json({ error: "Server staff must approve this event." }, { status: 403 });
  }

  let nextStatus: string;
  if (action === "PUBLISH") {
    nextStatus = event.staff_approval_required && !canManageCodes(role) ? "AWAITING_APPROVAL" : "SIGNUPS_OPEN";
  } else {
    nextStatus = {
      SUBMIT_APPROVAL: "AWAITING_APPROVAL",
      APPROVE: "SIGNUPS_OPEN",
      CLOSE_SIGNUPS: "SIGNUPS_CLOSED",
      OPEN_CHECKIN: "CHECK_IN_OPEN",
      START: "LIVE",
      COMPLETE: "COMPLETED",
      POSTPONE: "POSTPONED",
      CANCEL: "CANCELLED",
      REOPEN_DRAFT: "DRAFT",
    }[action] ?? event.status;
  }

  let bracketResult: { generated: boolean; participantCount: number };
  try {
    bracketResult = await withTransaction(async (connection) => {
      let result = { generated: false, participantCount: 0 };
      if (
        ["CLOSE_SIGNUPS", "OPEN_CHECKIN", "START"].includes(action)
        && event.bracket_enabled
        && event.bracket_auto_generate
        && event.bracket_format
        && event.bracket_seeding_mode
      ) {
        result = await generateEventBracket(connection, {
          eventId,
          eventName: event.name,
          format: event.bracket_format,
          seedingMode: event.bracket_seeding_mode,
          requireCheckIn: Boolean(event.bracket_require_check_in),
        });
      }

      if (action === "START" && event.bracket_enabled) {
        const [brackets] = await connection.query<(RowDataPacket & { settings_json: string | null })[]>(
          `SELECT settings_json FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`,
          [eventId],
        );
        if (!brackets[0]?.settings_json) {
          throw new TransitionConflict(
            event.bracket_seeding_mode === "MANUAL"
              ? "Place the approved participants and save the bracket before starting the event."
              : "The bracket could not be generated. Check that enough eligible participants are approved and checked in.",
          );
        }
      }

      await connection.execute(
        `UPDATE events
         SET status = ?,
             approved_by = IF(? = 'APPROVE', ?, approved_by),
             approved_at = IF(? = 'APPROVE', CURRENT_TIMESTAMP(3), approved_at),
             published_at = IF(? = 'SIGNUPS_OPEN' AND published_at IS NULL, CURRENT_TIMESTAMP(3), published_at),
             signups_closed_at = IF(? IN ('SIGNUPS_CLOSED', 'CHECK_IN_OPEN', 'LIVE'), CURRENT_TIMESTAMP(3), signups_closed_at),
             updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [nextStatus, action, session.userId, action, nextStatus, nextStatus, eventId],
      );

      if (action === "START" && event.bracket_enabled) {
        await connection.execute(
          `UPDATE brackets SET status = 'LIVE', updated_at = CURRENT_TIMESTAMP(3)
           WHERE event_id = ?`,
          [eventId],
        );
      }
      if (action === "COMPLETE" && event.bracket_enabled) {
        await connection.execute(
          `UPDATE brackets
           SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
           WHERE event_id = ?`,
          [eventId],
        );
      }

      return result;
    });
  } catch (error) {
    if (error instanceof TransitionConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: event.workspace_id,
    eventId,
    action: `event.status.${nextStatus.toLowerCase()}`,
    targetType: "event",
    targetId: eventId,
    details: { previousStatus: event.status, action, bracketResult },
  });

  return NextResponse.json({ status: nextStatus, bracketResult });
}
