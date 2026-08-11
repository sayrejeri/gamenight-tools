import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { getEventViewerAccess } from "@/lib/event-view-access";

const requestSchema = z.object({
  action: z.enum(["SIGN_UP", "CHECK_IN", "WITHDRAW"]).default("SIGN_UP"),
  connectionId: z.string().uuid().nullable().optional(),
});

type EventRow = RowDataPacket & {
  id: string;
  name: string;
  status: string;
  signup_mode: "AUTO" | "APPROVAL";
  signup_deadline: Date | null;
  check_in_opens_at: Date | null;
  check_in_deadline: Date | null;
  max_participants: number | null;
  join_code_required: number;
  required_connection_type: string | null;
  bracket_entry_mode: "PLAYER" | "TEAM";
};

type ConnectionRow = RowDataPacket & {
  id: string;
  connection_type: string;
  handle: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid signup request." }, { status: 400 });
  const { eventId } = await context.params;

  const events = await query<EventRow[]>(
    `SELECT id, name, status, signup_mode, signup_deadline, check_in_opens_at, check_in_deadline,
            max_participants, join_code_required, required_connection_type, bracket_entry_mode
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const existing = await query<(RowDataPacket & { status: string; checked_in_at: Date | null })[]>(
    `SELECT status, checked_in_at FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [eventId, session.userId],
  );
  const existingParticipant = existing[0] ?? null;

  // Withdrawal remains available to an existing entrant even if an organizer
  // later restricts the event; every other participation mutation must pass the
  // event's current visibility policy first.
  if (parsed.data.action === "WITHDRAW") {
    if (!existingParticipant || ["WITHDRAWN", "REJECTED"].includes(existingParticipant.status)) {
      return NextResponse.json({ error: "You are not actively signed up for this event." }, { status: 409 });
    }

    const promoted = await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE event_participants SET status = 'WITHDRAWN', checked_in_at = NULL
         WHERE event_id = ? AND user_id = ?`,
        [eventId, session.userId],
      );

      if (event.bracket_entry_mode === "PLAYER" && event.max_participants && existingParticipant.status === "APPROVED") {
        const [waitlist] = await connection.query<(RowDataPacket & { user_id: string })[]>(
          `SELECT CAST(user_id AS CHAR) AS user_id FROM event_participants
           WHERE event_id = ? AND status = 'WAITLISTED'
           ORDER BY joined_at ASC LIMIT 1 FOR UPDATE`,
          [eventId],
        );
        if (waitlist[0]) {
          await connection.execute(
            `UPDATE event_participants SET status = 'APPROVED', reviewed_at = CURRENT_TIMESTAMP(3)
             WHERE event_id = ? AND user_id = ?`,
            [eventId, waitlist[0].user_id],
          );
          await connection.execute(
            `INSERT INTO notifications (id, user_id, event_id, notification_type, category, title, message, action_url)
             VALUES (?, ?, ?, 'WAITLIST_PROMOTED', 'EVENTS', 'You are in!', ?, ?)`,
            [randomUUID(), waitlist[0].user_id, eventId, `A spot opened up and you were moved off the waitlist for ${event.name}.`, `/dashboard/events/${eventId}`],
          );
          return waitlist[0].user_id;
        }
      }
      return null;
    });
    return NextResponse.json({ status: "WITHDRAWN", promotedWaitlistUser: Boolean(promoted) });
  }

  const eventAccess = await getEventViewerAccess(session.userId, eventId);
  if (!eventAccess.event || !eventAccess.canView) {
    return NextResponse.json({ error: "You do not have access to participate in this event." }, { status: 403 });
  }
  if (eventAccess.event.visibility === "STAFF_ONLY" && !eventAccess.manager) {
    return NextResponse.json({ error: "This event is limited to authorized event staff." }, { status: 403 });
  }

  if (event.bracket_entry_mode === "TEAM") {
    return NextResponse.json(
      { error: "This event uses team registration. Register or manage your team from the tournament teams page." },
      { status: 409 },
    );
  }

  if (parsed.data.action === "CHECK_IN") {
    if (!existingParticipant || existingParticipant.status !== "APPROVED") {
      return NextResponse.json({ error: "You must be approved before checking in." }, { status: 409 });
    }
    if (event.status !== "CHECK_IN_OPEN") {
      return NextResponse.json({ error: "Check-in is not open." }, { status: 409 });
    }
    const now = Date.now();
    if (event.check_in_opens_at && new Date(event.check_in_opens_at).getTime() > now) {
      return NextResponse.json({ error: "Check-in has not opened yet." }, { status: 409 });
    }
    if (event.check_in_deadline && new Date(event.check_in_deadline).getTime() < now) {
      return NextResponse.json({ error: "The check-in deadline has passed." }, { status: 409 });
    }

    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE event_participants SET checked_in_at = CURRENT_TIMESTAMP(3)
         WHERE event_id = ? AND user_id = ? AND status = 'APPROVED'`,
        [eventId, session.userId],
      );
    });
    return NextResponse.json({ status: existingParticipant.status, checkedIn: true });
  }

  if (eventAccess.event.visibility === "CODE_ONLY" && !eventAccess.participant && !eventAccess.manager) {
    return NextResponse.json({ error: "Redeem the event join code before signing up." }, { status: 403 });
  }

  if (event.status !== "SIGNUPS_OPEN") {
    return NextResponse.json({ error: "Signups are not open for this event." }, { status: 409 });
  }
  if (event.signup_deadline && new Date(event.signup_deadline).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The signup deadline has passed." }, { status: 409 });
  }
  if (event.join_code_required && !existingParticipant) {
    return NextResponse.json({ error: "Redeem the event join code before completing your signup." }, { status: 403 });
  }

  let selectedConnection: ConnectionRow | null = null;
  if (event.required_connection_type) {
    const connections = await query<ConnectionRow[]>(
      `SELECT id, connection_type, handle
       FROM user_connections
       WHERE user_id = ? AND is_visible = 1
         AND LOWER(connection_type) = LOWER(?)
         AND (? IS NULL OR id = ?)
       ORDER BY is_verified DESC, source ASC LIMIT 1`,
      [session.userId, event.required_connection_type, parsed.data.connectionId ?? null, parsed.data.connectionId ?? null],
    );
    selectedConnection = connections[0] ?? null;
    if (!selectedConnection) {
      return NextResponse.json(
        { error: `Add a visible ${event.required_connection_type} identity to your profile before signing up.` },
        { status: 409 },
      );
    }
  }

  const result = await withTransaction(async (connection) => {
    const [lockedEvents] = await connection.query<(RowDataPacket & { max_participants: number | null; signup_mode: "AUTO" | "APPROVAL" })[]>(
      `SELECT max_participants, signup_mode FROM events WHERE id = ? LIMIT 1 FOR UPDATE`,
      [eventId],
    );
    const currentMaximum = lockedEvents[0]?.max_participants ?? null;
    const signupMode = lockedEvents[0]?.signup_mode ?? "AUTO";
    const [approvedRows] = await connection.query<(RowDataPacket & { user_id: string })[]>(
      `SELECT user_id FROM event_participants
       WHERE event_id = ? AND status = 'APPROVED'`,
      [eventId],
    );
    const status = signupMode === "APPROVAL"
      ? "PENDING"
      : currentMaximum && approvedRows.length >= currentMaximum
        ? "WAITLISTED"
        : "APPROVED";

    await connection.execute(
      `INSERT INTO event_participants
        (event_id, user_id, status, game_identity_type, game_identity_value, signup_completed_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         status = IF(status IN ('WITHDRAWN', 'PENDING', 'WAITLISTED'), VALUES(status), status),
         game_identity_type = VALUES(game_identity_type),
         game_identity_value = VALUES(game_identity_value),
         signup_completed_at = VALUES(signup_completed_at)`,
      [eventId, session.userId, status, selectedConnection?.connection_type ?? null, selectedConnection?.handle ?? null],
    );

    return status;
  });

  return NextResponse.json({ status: result, requiresApproval: result === "PENDING" && event.signup_mode === "APPROVAL" });
}
