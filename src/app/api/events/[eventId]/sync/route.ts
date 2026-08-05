import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { generateEventBracket } from "@/lib/bracket-generation";

type EventRow = RowDataPacket & {
  id: string;
  name: string;
  status: string;
  signup_deadline: Date | null;
  bracket_enabled: number;
  bracket_format: "SINGLE_ELIMINATION" | "THREE_PLAYER" | null;
  bracket_seeding_mode: "RANDOM" | "MANUAL" | null;
  bracket_auto_generate: number;
  bracket_require_check_in: number;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const events = await query<EventRow[]>(
    `SELECT id, name, status, signup_deadline, bracket_enabled, bracket_format,
            bracket_seeding_mode, bracket_auto_generate, bracket_require_check_in
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const deadlinePassed = event.signup_deadline && new Date(event.signup_deadline).getTime() <= Date.now();
  if (event.status !== "SIGNUPS_OPEN" || !deadlinePassed) {
    return NextResponse.json({ changed: false, status: event.status });
  }

  const bracketResult = await withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `UPDATE events
       SET status = 'SIGNUPS_CLOSED', signups_closed_at = CURRENT_TIMESTAMP(3),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND status = 'SIGNUPS_OPEN'`,
      [eventId],
    );
    if ((result as { affectedRows?: number }).affectedRows !== 1) {
      return { generated: false, participantCount: 0 };
    }

    if (
      event.bracket_enabled
      && event.bracket_auto_generate
      && event.bracket_format
      && event.bracket_seeding_mode
    ) {
      return generateEventBracket(connection, {
        eventId,
        eventName: event.name,
        format: event.bracket_format,
        seedingMode: event.bracket_seeding_mode,
        requireCheckIn: Boolean(event.bracket_require_check_in),
      });
    }

    return { generated: false, participantCount: 0 };
  });

  return NextResponse.json({ changed: true, status: "SIGNUPS_CLOSED", bracketResult });
}
