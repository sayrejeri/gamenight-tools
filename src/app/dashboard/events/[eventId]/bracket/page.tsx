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
  user_in_guild: number;
};
type CohostRow = RowDataPacket & { permission_level: string };
type BracketRow = RowDataPacket & { settings_json: string | null; status: string };

export default async function EventBracketPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, e.name, e.primary_host_id, e.status, e.visibility, e.bracket_enabled,
            EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id) AS user_in_guild
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? LIMIT 1`,
    [session.userId, eventId],
  );
  const event = events[0];
  if (!event || !event.bracket_enabled) notFound();

  const [workspaceAccess, cohostRows, participantRows, bracketRows] = await Promise.all([
    getWorkspacePermissionSnapshot(session.userId, event.workspace_id),
    query<CohostRow[]>(`SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId]),
    query<(RowDataPacket & { status: string })[]>(`SELECT status FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1`, [eventId, session.userId]),
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

  const restrictedStatus = event.status === "DRAFT" || event.status === "AWAITING_APPROVAL";
  const canViewEvent = restrictedStatus
    ? isEventManager
    : event.visibility === "PUBLIC"
      || event.visibility === "UNLISTED"
      || (event.visibility === "SERVER" && Boolean(event.user_in_guild))
      || isEventManager
      || Boolean(participantRows[0]);
  if (!canViewEvent) notFound();

  const bracket = bracketRows[0];
  if (!bracket?.settings_json) {
    return <section className="panel section-stack"><h1>Bracket unavailable</h1><p className="muted">The host has not saved a bracket for this event yet.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;
  }
  if (!canManageBracket && !["LIVE", "COMPLETED"].includes(bracket.status)) {
    return <section className="panel section-stack"><h1>Bracket not live yet</h1><p className="muted">The host is still preparing the bracket. Check back once it has been published.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;
  }

  let state: unknown = null;
  try { state = JSON.parse(bracket.settings_json); } catch { state = null; }

  return (
    <div className="section-stack competitive-view-page">
      <section className="page-heading">
        <div><span className="eyebrow">Competitive event</span><h1>{event.name} bracket</h1><p>Follow the saved tournament results as the event progresses.</p></div>
        <div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link>{canManageBracket ? <Link className="button" href={`/dashboard/tools/bracket?eventId=${eventId}`}>Manage bracket</Link> : null}</div>
      </section>
      <section className="panel section-stack"><BracketViewer state={state} status={bracket.status} /></section>
    </div>
  );
}
