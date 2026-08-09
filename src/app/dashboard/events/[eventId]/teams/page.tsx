import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";
import { EventTeamManager } from "@/components/event-team-manager";

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  primary_host_id: string;
  name: string;
  status: string;
  visibility: string;
  bracket_enabled: number;
  bracket_entry_mode: string;
  user_in_guild: number;
};

export default async function EventTeamsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, CAST(e.primary_host_id AS CHAR) AS primary_host_id, e.name, e.status,
            e.visibility, e.bracket_enabled, e.bracket_entry_mode,
            EXISTS(SELECT 1 FROM user_guilds ug INNER JOIN workspaces w2 ON w2.id = e.workspace_id
                   WHERE ug.user_id = ? AND ug.guild_id = w2.discord_guild_id) AS user_in_guild
     FROM events e WHERE e.id = ? LIMIT 1`,
    [session.userId, eventId],
  );
  const event = events[0];
  if (!event || !event.bracket_enabled || event.bracket_entry_mode !== "TEAM") notFound();

  const [workspaceAccess, cohosts, participant] = await Promise.all([
    getWorkspacePermissionSnapshot(session.userId, event.workspace_id),
    query<(RowDataPacket & { permission_level: string })[]>(`SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId]),
    query<(RowDataPacket & { user_id: string })[]>(`SELECT CAST(user_id AS CHAR) AS user_id FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1`, [eventId, session.userId]),
  ]);
  const isManager = event.primary_host_id === session.userId
    || ["HOST_EVENTS", "MANAGE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS"].some((permission) => workspaceAccess.permissions.includes(permission as typeof workspaceAccess.permissions[number]))
    || Boolean(cohosts[0]);
  const restricted = event.status === "DRAFT" || event.status === "AWAITING_APPROVAL" || event.visibility === "STAFF_ONLY";
  const canView = restricted
    ? isManager
    : event.visibility === "PUBLIC"
      || event.visibility === "UNLISTED"
      || (event.visibility === "SERVER" && Boolean(event.user_in_guild))
      || isManager
      || Boolean(participant[0]);
  if (!canView) notFound();

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Team tournament</span><h1>{event.name} teams</h1><p>Register eligible teams, review roster snapshots, and prepare the tournament field before competition generation.</p></div><div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link><Link className="button button-secondary" href={`/dashboard/tools/bracket?eventId=${eventId}`}>Competition manager</Link></div></section>
      <EventTeamManager eventId={eventId} />
    </div>
  );
}
