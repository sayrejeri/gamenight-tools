import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEventViewerAccess } from "@/lib/event-view-access";

function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
}

function formatIcsDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

type EventRow = RowDataPacket & {
  id: string;
  name: string;
  starts_at: Date | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await getEventViewerAccess(session.userId, eventId);
  if (!access.event || !access.canView) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const events = await query<EventRow[]>(
    `SELECT id, name, starts_at FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event || !event.starts_at) return NextResponse.json({ error: "This event has no start time." }, { status: 404 });

  const start = new Date(event.starts_at);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Game Night Tools//Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@gamenights.sayrejeri.com`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `SUMMARY:${escapeIcs(event.name)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "game-night"}.ics"`,
    },
  });
}
