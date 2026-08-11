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
  description: string | null;
  starts_at: Date | null;
  game_url: string | null;
  workspace_name: string;
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
    `SELECT e.id, e.name, e.description, e.starts_at, e.game_url, w.name AS workspace_name
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id
     WHERE e.id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event || !event.starts_at) return NextResponse.json({ error: "This event has no start time." }, { status: 404 });

  const start = new Date(event.starts_at);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const appUrl = process.env.APP_URL ?? "https://gamenights.sayrejeri.com";
  const description = [event.description, event.game_url, `${appUrl}/dashboard/events/${event.id}`].filter(Boolean).join("\n\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Game Night Tools//Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@gamenights.sayrejeri.com`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.name)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(event.workspace_name)}`,
    `URL:${appUrl}/dashboard/events/${event.id}`,
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
