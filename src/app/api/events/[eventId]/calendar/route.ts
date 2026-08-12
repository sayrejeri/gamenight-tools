import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { renderEventDescriptionPlainText } from "@/lib/event-description";
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
  signup_deadline: Date | null;
  check_in_opens_at: Date | null;
  check_in_deadline: Date | null;
  timezone: string;
  game_name: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  game_url: string | null;
  status: string;
  visibility: string;
  bracket_enabled: number;
  bracket_format: string | null;
  bracket_entry_mode: "PLAYER" | "TEAM";
  bracket_seeding_mode: string | null;
  max_participants: number | null;
  workspace_name: string;
  primary_host_name: string;
  cohost_names: string | null;
  entrant_count: number;
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
    `SELECT e.id, e.name, e.description, e.starts_at, e.signup_deadline, e.check_in_opens_at, e.check_in_deadline,
            e.timezone, e.game_name, e.platform_name, e.subgame_name, e.game_url, e.status, e.visibility,
            e.bracket_enabled, e.bracket_format, e.bracket_entry_mode, e.bracket_seeding_mode, e.max_participants,
            w.name AS workspace_name, COALESCE(host.global_name, host.username) AS primary_host_name,
            (SELECT GROUP_CONCAT(COALESCE(cu.global_name, cu.username) ORDER BY ec.created_at SEPARATOR '|||')
             FROM event_cohosts ec INNER JOIN users cu ON cu.id = ec.invited_user_id
             WHERE ec.event_id = e.id AND ec.status = 'ACCEPTED') AS cohost_names,
            CASE WHEN e.bracket_entry_mode = 'TEAM'
              THEN (SELECT COUNT(*) FROM event_team_entries ete WHERE ete.event_id = e.id AND ete.status = 'REGISTERED')
              ELSE (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id AND ep.status = 'APPROVED')
            END AS entrant_count
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN users host ON host.id = e.primary_host_id
     WHERE e.id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event || !event.starts_at) return NextResponse.json({ error: "This event has no start time." }, { status: 404 });

  const start = new Date(event.starts_at);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const appUrl = process.env.APP_URL ?? "https://gamenights.sayrejeri.com";
  const renderedDescription = event.description ? renderEventDescriptionPlainText(event.description, {
    eventName: event.name,
    eventStart: event.starts_at,
    signupDeadline: event.signup_deadline,
    checkInOpensAt: event.check_in_opens_at,
    checkInDeadline: event.check_in_deadline,
    timezone: event.timezone,
    game: event.subgame_name ?? event.game_name ?? event.platform_name,
    platform: event.platform_name,
    format: event.bracket_enabled ? event.bracket_format : null,
    entrantMode: event.bracket_entry_mode,
    seedingMode: event.bracket_seeding_mode,
    status: event.status,
    visibility: event.visibility,
    host: event.primary_host_name,
    cohosts: event.cohost_names ? event.cohost_names.split("|||").filter(Boolean) : [],
    participants: Number(event.entrant_count ?? 0),
    maxParticipants: event.max_participants,
    workspace: event.workspace_name,
  }) : "";
  const description = [renderedDescription, event.game_url, `${appUrl}/dashboard/events/${event.id}`].filter(Boolean).join("\n\n");
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
