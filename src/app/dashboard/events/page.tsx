import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEventManagerWorkspaceScope } from "@/lib/event-view-access";
import { LocalDateTime } from "@/components/local-date-time";

type EventRow = RowDataPacket & { id: string; workspace_id: string; name: string; status: string; visibility: string; starts_at: Date | null; timezone: string; workspace_name: string; subgame_name: string | null; game_name: string | null; platform_name: string | null; game_thumbnail_url: string | null; participant_count: number; relationship: string };

export default async function EventsPage() {
  const session = await requireSession();
  const managerScope = await getEventManagerWorkspaceScope(session.userId);
  const managerSql = managerScope.allWorkspaces
    ? "1 = 1"
    : managerScope.workspaceIds.length
      ? `e.workspace_id IN (${managerScope.workspaceIds.map(() => "?").join(",")})`
      : "1 = 0";

  const events = await query<EventRow[]>(
    `SELECT DISTINCT e.id, e.workspace_id, e.name, e.status, e.visibility, e.starts_at, e.timezone,
            e.subgame_name, e.game_name, e.platform_name, e.game_thumbnail_url,
            w.name AS workspace_name,
            (SELECT COUNT(*) FROM event_participants epc WHERE epc.event_id = e.id AND epc.status IN ('APPROVED', 'WAITLISTED')) AS participant_count,
            CASE WHEN e.primary_host_id = ? THEN 'HOSTING'
                 WHEN ec.invited_user_id IS NOT NULL THEN 'COHOSTING'
                 WHEN ep.user_id IS NOT NULL THEN 'PARTICIPATING'
                 WHEN ug.user_id IS NOT NULL AND e.visibility = 'SERVER' THEN 'SERVER ACCESS'
                 ELSE 'SERVER STAFF' END AS relationship
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id
     LEFT JOIN user_guilds ug ON ug.user_id = ? AND ug.guild_id = w.discord_guild_id
     LEFT JOIN event_participants ep ON ep.event_id = e.id AND ep.user_id = ? AND ep.status NOT IN ('REJECTED', 'WITHDRAWN')
     LEFT JOIN event_cohosts ec ON ec.event_id = e.id AND ec.invited_user_id = ? AND ec.status = 'ACCEPTED'
     WHERE e.primary_host_id = ?
        OR ec.invited_user_id IS NOT NULL
        OR (${managerSql})
        OR (
          e.status NOT IN ('DRAFT', 'AWAITING_APPROVAL')
          AND (
            e.visibility = 'PUBLIC'
            OR (e.visibility = 'SERVER' AND (ug.user_id IS NOT NULL OR ep.user_id IS NOT NULL))
            OR (e.visibility = 'CODE_ONLY' AND ep.user_id IS NOT NULL)
            OR (e.visibility = 'UNLISTED' AND ep.user_id IS NOT NULL)
          )
        )
     ORDER BY FIELD(e.status, 'LIVE', 'CHECK_IN_OPEN', 'SIGNUPS_OPEN', 'SIGNUPS_CLOSED', 'AWAITING_APPROVAL', 'DRAFT', 'POSTPONED', 'COMPLETED', 'CANCELLED'), COALESCE(e.starts_at, '9999-12-31') ASC
     LIMIT 100`,
    [session.userId, session.userId, session.userId, session.userId, session.userId, ...managerScope.workspaceIds],
  );
  return <div className="section-stack"><section className="page-heading"><div><span className="eyebrow">Your schedule</span><h1>Events</h1><p>Events you host, manage, joined, or can access through an approved server profile.</p></div></section><section className="panel section-stack"><div className="event-grid">{events.length ? events.map((event) => <Link className="event-card event-card-media" href={`/dashboard/events/${event.id}`} key={event.id}>{event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : <div className="event-image-fallback">{(event.subgame_name ?? event.game_name ?? event.platform_name ?? "GN").slice(0, 2)}</div>}<div><span className="card-kicker">{event.workspace_name} · {event.relationship}</span><h3>{event.name}</h3><p>{event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game not selected"}</p><p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} fallbackTimeZone={event.timezone} includeRelative /></p><span className="badge">{event.status.replaceAll("_", " ")}</span><span className="badge">{event.participant_count} participants</span></div></Link>) : <div className="empty-state">No events are available yet.</div>}</div></section></div>;
}
