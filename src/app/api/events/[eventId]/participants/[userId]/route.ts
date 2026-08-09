import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "WAITLISTED", "REJECTED", "NO_SHOW", "DISQUALIFIED"]).optional(),
  staffNote: z.string().trim().max(1000).optional(),
}).refine((value) => value.status !== undefined || value.staffNote !== undefined, { message: "No participant changes were provided." });

type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string; name: string; max_participants: number | null };
type ParticipantRow = RowDataPacket & { status: string; staff_note: string | null };

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string; userId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId, userId } = await context.params;
  if (!/^\d+$/.test(userId)) return NextResponse.json({ error: "Invalid participant." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid participant update." }, { status: 400 });

  const events = await query<EventRow[]>(`SELECT workspace_id, primary_host_id, name, max_participants FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId
    || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_PARTICIPANTS")
    || ["FULL", "SIGNUPS", "SCOREKEEPER"].includes(cohost[0]?.permission_level ?? "");
  if (!allowed) return NextResponse.json({ error: "Participant-management permission is required." }, { status: 403 });

  const result = await withTransaction(async (connection) => {
    const [rows] = await connection.query<ParticipantRow[]>(
      `SELECT status, staff_note FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [eventId, userId],
    );
    const participant = rows[0];
    if (!participant) return null;

    const requestedStatus = parsed.data.status ?? participant.status;
    let nextStatus = requestedStatus;
    if (requestedStatus === "APPROVED" && participant.status !== "APPROVED" && event.max_participants) {
      const [approvedRows] = await connection.query<(RowDataPacket & { user_id: string })[]>(
        `SELECT CAST(user_id AS CHAR) AS user_id FROM event_participants WHERE event_id = ? AND status = 'APPROVED' FOR UPDATE`,
        [eventId],
      );
      if (approvedRows.length >= event.max_participants) nextStatus = "WAITLISTED";
    }

    const nextNote = parsed.data.staffNote !== undefined ? (parsed.data.staffNote.trim() || null) : participant.staff_note;
    await connection.execute(
      `UPDATE event_participants
       SET status = ?, staff_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3),
           checked_in_at = IF(? IN ('REJECTED', 'NO_SHOW', 'DISQUALIFIED', 'WAITLISTED'), NULL, checked_in_at)
       WHERE event_id = ? AND user_id = ?`,
      [nextStatus, nextNote, session.userId, nextStatus, eventId, userId],
    );

    let promotedUserId: string | null = null;
    if (event.max_participants && participant.status === "APPROVED" && nextStatus !== "APPROVED") {
      const [waitlist] = await connection.query<(RowDataPacket & { user_id: string })[]>(
        `SELECT CAST(user_id AS CHAR) AS user_id FROM event_participants
         WHERE event_id = ? AND status = 'WAITLISTED' AND user_id <> ?
         ORDER BY joined_at ASC LIMIT 1 FOR UPDATE`,
        [eventId, userId],
      );
      if (waitlist[0]) {
        promotedUserId = waitlist[0].user_id;
        await connection.execute(
          `UPDATE event_participants SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3)
           WHERE event_id = ? AND user_id = ?`,
          [session.userId, eventId, promotedUserId],
        );
        await connection.execute(
          `INSERT INTO notifications (id, user_id, event_id, notification_type, category, title, message, action_url)
           VALUES (?, ?, ?, 'WAITLIST_PROMOTED', 'EVENTS', 'You are in!', ?, ?)`,
          [randomUUID(), promotedUserId, eventId, `A spot opened up and you were moved off the waitlist for ${event.name}.`, `/dashboard/events/${eventId}`],
        );
      }
    }

    if (parsed.data.status !== undefined && nextStatus !== participant.status) {
      const copy = nextStatus === "APPROVED"
        ? `Your signup for ${event.name} was approved.`
        : nextStatus === "WAITLISTED"
          ? `Your signup for ${event.name} is on the waitlist.`
          : nextStatus === "REJECTED"
            ? `Your signup for ${event.name} was not approved.`
            : `Your signup status for ${event.name} changed to ${nextStatus.replaceAll("_", " ").toLowerCase()}.`;
      await connection.execute(
        `INSERT INTO notifications (id, user_id, event_id, notification_type, category, title, message, action_url)
         VALUES (?, ?, ?, 'PARTICIPANT_STATUS', 'EVENTS', 'Event signup updated', ?, ?)`,
        [randomUUID(), userId, eventId, copy, `/dashboard/events/${eventId}`],
      );
    }

    return { previousStatus: participant.status, status: nextStatus, staffNote: nextNote, promotedUserId };
  });

  if (!result) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: event.workspace_id,
    eventId,
    action: parsed.data.status !== undefined ? "event.participant.updated" : "event.participant.note_updated",
    targetType: "user",
    targetId: userId,
    details: { previousStatus: result.previousStatus, status: result.status, noteChanged: parsed.data.staffNote !== undefined, promotedUserId: result.promotedUserId },
  });
  return NextResponse.json({ success: true, status: result.status, staffNote: result.staffNote, promotedWaitlistUser: Boolean(result.promotedUserId) });
}
