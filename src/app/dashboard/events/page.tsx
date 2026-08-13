import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEventManagerWorkspaceScope } from "@/lib/event-view-access";
import { LocalDateTime } from "@/components/local-date-time";

type EventView = "active" | "past" | "archived" | "all";
type ArchiveSetting = "30" | "60" | "90" | "off";
type EventRow = RowDataPacket & { id: string; workspace_id: string; name: string; status: string; visibility: string; starts_at: Date | null; updated_at: Date; timezone: string; workspace_name: string; subgame_name: string | null; game_name: string | null; platform_name: string | null; game_thumbnail_url: string | null; participant_count: number; relationship: string };

const views: Array<{ value: EventView; label: string }> = [
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];
const archiveSettings: Array<{ value: ArchiveSetting; label: string }> = [
  { value: "30", label: "After 30 days" },
  { value: "60", label: "After 60 days" },
  { value: "90", label: "After 90 days" },
  { value: "off", label: "Off" },
];

function normalizeView(value: string | undefined): EventView {
  return views.some((view) => view.value === value) ? value as EventView : "active";
}

function normalizeArchiveSetting(value: string | undefined): ArchiveSetting {
  return archiveSettings.some((setting) => setting.value === value) ? value as ArchiveSetting : "30";
}

function isPastStatus(status: string): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; archiveDays?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const selectedView = normalizeView(params.view);
  const archiveSetting = normalizeArchiveSetting(params.archiveDays);
  const archiveDays = archiveSetting === "off" ? null : Number(archiveSetting);
  const archiveCutoff = archiveDays === null ? null : Date.now() - archiveDays * 24 * 60 * 60 * 1000;

  const managerScope = await getEventManagerWorkspaceScope(session.userId);
  const managerSql = managerScope.allWorkspaces
    ? "1 = 1"
    : managerScope.workspaceIds.length
      ? `e.workspace_id IN (${managerScope.workspaceIds.map(() => "?").join(",")})`
      : "1 = 0";

  const events = await query<EventRow[]>(
    `SELECT DISTINCT e.id, e.workspace_id, e.name, e.status, e.visibility, e.starts_at, e.updated_at, e.timezone,
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
            OR (e.visibility = 'SERVER' AND (
              ug.user_id IS NOT NULL
              OR ep.user_id IS NOT NULL
              OR EXISTS(
                SELECT 1 FROM event_team_entries ete
                WHERE ete.event_id = e.id AND ete.status = 'REGISTERED'
                  AND JSON_SEARCH(ete.roster_json, 'one', ?, NULL, '$[*].userId') IS NOT NULL
              )
            ))
            OR (e.visibility = 'CODE_ONLY' AND (
              ep.user_id IS NOT NULL
              OR EXISTS(
                SELECT 1 FROM event_team_entries ete
                WHERE ete.event_id = e.id AND ete.status = 'REGISTERED'
                  AND JSON_SEARCH(ete.roster_json, 'one', ?, NULL, '$[*].userId') IS NOT NULL
              )
            ))
            OR (e.visibility = 'UNLISTED' AND (
              ep.user_id IS NOT NULL
              OR EXISTS(
                SELECT 1 FROM event_team_entries ete
                WHERE ete.event_id = e.id AND ete.status = 'REGISTERED'
                  AND JSON_SEARCH(ete.roster_json, 'one', ?, NULL, '$[*].userId') IS NOT NULL
              )
            ))
          )
        )
     ORDER BY FIELD(e.status, 'LIVE', 'CHECK_IN_OPEN', 'SIGNUPS_OPEN', 'SIGNUPS_CLOSED', 'AWAITING_APPROVAL', 'DRAFT', 'POSTPONED', 'COMPLETED', 'CANCELLED'), COALESCE(e.starts_at, '9999-12-31') ASC
     LIMIT 100`,
    [session.userId, session.userId, session.userId, session.userId, session.userId, ...managerScope.workspaceIds, session.userId, session.userId, session.userId],
  );

  const eventBucket = (event: EventRow): Exclude<EventView, "all"> => {
    if (!isPastStatus(event.status)) return "active";
    if (archiveCutoff === null) return "past";
    const ageSource = event.starts_at ?? event.updated_at;
    return new Date(ageSource).getTime() < archiveCutoff ? "archived" : "past";
  };
  const counts = {
    active: events.filter((event) => eventBucket(event) === "active").length,
    past: events.filter((event) => eventBucket(event) === "past").length,
    archived: events.filter((event) => eventBucket(event) === "archived").length,
    all: events.length,
  };
  const visibleEvents = selectedView === "all" ? events : events.filter((event) => eventBucket(event) === selectedView);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Your schedule</span><h1>Events</h1><p>Current events stay up front while completed and cancelled events move into Past and Archived views without deleting any history.</p></div></section>
      <section className="panel section-stack">
        <div className="events-view-controls">
          <div className="events-view-tabs">
            {views.map((view) => <Link className={`button${selectedView === view.value ? "" : " button-secondary"}`} href={`/dashboard/events?view=${view.value}&archiveDays=${archiveSetting}`} key={view.value}>{view.label} · {counts[view.value]}</Link>)}
          </div>
          <form className="events-archive-form" method="get">
            <input type="hidden" name="view" value={selectedView} />
            <label htmlFor="archive-days"><span className="field-help">Auto-archive completed/cancelled</span><select id="archive-days" name="archiveDays" defaultValue={archiveSetting}>{archiveSettings.map((setting) => <option value={setting.value} key={setting.value}>{setting.label}</option>)}</select></label>
            <button className="button button-secondary" type="submit">Apply</button>
          </form>
        </div>
        <p className="field-help">Archive is only a dashboard view. Events, brackets, results, statistics, and links are never deleted by this filter.</p>
        <div className="event-grid">{visibleEvents.length ? visibleEvents.map((event) => <Link className="event-card event-card-media" href={`/dashboard/events/${event.id}`} key={event.id}>{event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : <div className="event-image-fallback">{(event.subgame_name ?? event.game_name ?? event.platform_name ?? "GN").slice(0, 2)}</div>}<div><span className="card-kicker">{event.workspace_name} · {event.relationship}</span><h3>{event.name}</h3><p>{event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game not selected"}</p><p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} fallbackTimeZone={event.timezone} includeRelative /></p><span className="badge">{event.status.replaceAll("_", " ")}</span><span className="badge">{event.participant_count} participants</span></div></Link>) : <div className="empty-state">No {selectedView === "all" ? "events" : selectedView} events are available.</div>}</div>
      </section>
    </div>
  );
}
