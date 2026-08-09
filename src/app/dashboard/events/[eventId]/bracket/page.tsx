import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";
import { BracketViewer } from "@/components/bracket-viewer";

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  name: string;
  primary_host_id: string;
  status: string;
  visibility: string;
  bracket_enabled: number;
  bracket_entry_mode: "PLAYER" | "TEAM";
  user_in_guild: number;
};
type CohostRow = RowDataPacket & { permission_level: string };
type BracketRow = RowDataPacket & { settings_json: string | null; status: string };
type TeamRosterRow = RowDataPacket & { roster_json: string | null };

function rosterContains(value: string | null, userId: string): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.some((member) => member && typeof member === "object" && (member as { userId?: unknown }).userId === userId);
  } catch { return false; }
}

export default async function EventBracketPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, e.name, CAST(e.primary_host_id AS CHAR) AS primary_host_id,
            e.status, e.visibility, e.bracket_enabled, e.bracket_entry_mode,
            EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id) AS user_in_guild
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? LIMIT 1`,
    [session.userId, eventId],
  );
  const event = events[0];
  if (!event || !event.bracket_enabled) notFound();

  const [workspaceAccess, cohostRows, participantRows, teamRows, bracketRows] = await Promise.all([
    getWorkspacePermissionSnapshot(session.userId, event.workspace_id),
    query<CohostRow[]>(`SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId]),
    query<(RowDataPacket & { status: string })[]>(`SELECT status FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1`, [eventId, session.userId]),
    event.bracket_entry_mode === "TEAM"
      ? query<TeamRosterRow[]>(`SELECT roster_json FROM event_team_entries WHERE event_id = ? AND status = 'REGISTERED'`, [eventId])
      : Promise.resolve([] as TeamRosterRow[]),
    query<BracketRow[]>(`SELECT settings_json, status FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]),
  ]);

  const eventPermissions = workspaceAccess.permissions;
  const cohostLevel = cohostRows[0]?.permission_level ?? "";
  const isEventManager = event.primary_host_id === session.userId
    || ["HOST_EVENTS", "MANAGE_EVENTS", "APPROVE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS"].some((permission) => eventPermissions.includes(permission as typeof eventPermissions[number]))
    || Boolean(cohostRows[0]);
  const canManageBracket = event.primary_host_id === session.userId
    || eventPermissions.includes("MANAGE_BRACKETS")
    || ["FULL", "BRACKET"].includes(cohostLevel);
  const onRegisteredTeam = teamRows.some((row) => rosterContains(row.roster_json, session.userId));

  const restrictedStatus = event.status === "DRAFT" || event.status === "AWAITING_APPROVAL";
  const canViewEvent = restrictedStatus
    ? isEventManager
    : event.visibility === "PUBLIC"
      || event.visibility === "UNLISTED"
      || (event.visibility === "SERVER" && Boolean(event.user_in_guild))
      || isEventManager
      || Boolean(participantRows[0])
      || onRegisteredTeam;
  if (!canViewEvent) notFound();

  const bracket = bracketRows[0];
  if (!bracket?.settings_json) {
    return <section className="panel section-stack"><h1>Competition unavailable</h1><p className="muted">The host has not saved a competition for this event yet.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;
  }
  if (!canManageBracket && !["LIVE", "COMPLETED"].includes(bracket.status)) {
    return <section className="panel section-stack"><h1>Competition not live yet</h1><p className="muted">The host is still preparing the competition. Check back once it has been published.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;
  }

  let state: unknown = null;
  try { state = JSON.parse(bracket.settings_json); } catch { state = null; }

  return (
    <div className="section-stack competitive-view-page">
      <section className="page-heading">
        <div><span className="eyebrow">Competitive event</span><h1>{event.name} competition</h1><p>Follow the saved tournament results as the event progresses.</p></div>
        <div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link>{event.bracket_entry_mode === "TEAM" ? <Link className="button button-secondary" href={`/dashboard/events/${eventId}/teams`}>Tournament teams</Link> : null}<Link className="button button-secondary" href={`/dashboard/events/${eventId}/matches`}>Match Center</Link>{canManageBracket ? <Link className="button" href={`/dashboard/tools/bracket?eventId=${eventId}`}>Manage competition</Link> : null}</div>
      </section>
      <section className="panel section-stack"><BracketViewer state={state} status={bracket.status} /></section>
    </div>
  );
}
