import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { query } from "@/lib/db";
import { CohostInviteForm } from "@/components/cohost-invite-form";

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  workspace_name: string;
  name: string;
  description: string | null;
  game_name: string | null;
  status: string;
  visibility: string;
  join_code_required: number;
  starts_at: Date | null;
  signup_deadline: Date | null;
  max_participants: number | null;
  timezone: string;
  primary_host_id: string;
  primary_host_name: string;
  user_in_guild: number;
};

type CohostRow = RowDataPacket & {
  id: string;
  invited_discord_id: string;
  permission_level: string;
  status: string;
  username: string | null;
  global_name: string | null;
};

type ParticipantCountRow = RowDataPacket & { total: number };

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;

  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, w.name AS workspace_name, e.name, e.description, e.game_name,
            e.status, e.visibility, e.join_code_required, e.starts_at, e.signup_deadline,
            e.max_participants, e.timezone, e.primary_host_id,
            COALESCE(host.global_name, host.username) AS primary_host_name,
            EXISTS(
              SELECT 1 FROM user_guilds ug
              WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id
            ) AS user_in_guild
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN users host ON host.id = e.primary_host_id
     WHERE e.id = ? LIMIT 1`,
    [session.userId, eventId],
  );
  const event = events[0];
  if (!event) notFound();

  const role = await getWorkspaceRole(session.userId, event.workspace_id);
  const cohostAccess = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const participantAccess = await query<(RowDataPacket & { status: string })[]>(
    `SELECT status FROM event_participants
     WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [eventId, session.userId],
  );

  const isPrimaryHost = event.primary_host_id === session.userId;
  const canView = event.visibility === "PUBLIC" ||
    (event.visibility === "SERVER" && Boolean(event.user_in_guild)) ||
    Boolean(role) || isPrimaryHost || Boolean(cohostAccess[0]) || Boolean(participantAccess[0]);
  if (!canView) notFound();

  const [cohosts, participantCounts] = await Promise.all([
    query<CohostRow[]>(
      `SELECT ec.id, ec.invited_discord_id, ec.permission_level, ec.status,
              u.username, u.global_name
       FROM event_cohosts ec
       LEFT JOIN users u ON u.id = ec.invited_user_id
       WHERE ec.event_id = ? ORDER BY ec.created_at DESC`,
      [eventId],
    ),
    query<ParticipantCountRow[]>(
      `SELECT COUNT(*) AS total FROM event_participants
       WHERE event_id = ? AND status NOT IN ('REJECTED', 'WITHDRAWN')`,
      [eventId],
    ),
  ]);

  const canManageEvent = isPrimaryHost || canManageCodes(role) || cohostAccess[0]?.permission_level === "FULL";

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{event.workspace_name}</span>
          <h1>{event.name}</h1>
          <p>{event.description ?? "No event description has been added yet."}</p>
        </div>
        <span className="badge">{event.status.replaceAll("_", " ")}</span>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Event details</h2>
          <div className="detail-list">
            <div><span>Game</span><strong>{event.game_name ?? "Not selected"}</strong></div>
            <div><span>Main host</span><strong>{event.primary_host_name}</strong></div>
            <div><span>Starts</span><strong>{event.starts_at ? new Date(event.starts_at).toLocaleString() : "Not scheduled"}</strong></div>
            <div><span>Signup deadline</span><strong>{event.signup_deadline ? new Date(event.signup_deadline).toLocaleString() : "Not set"}</strong></div>
            <div><span>Participants</span><strong>{participantCounts[0]?.total ?? 0}{event.max_participants ? ` / ${event.max_participants}` : ""}</strong></div>
            <div><span>Visibility</span><strong>{event.visibility}</strong></div>
            <div><span>Join code</span><strong>{event.join_code_required ? "Required" : "Not required"}</strong></div>
            <div><span>Timezone</span><strong>{event.timezone}</strong></div>
          </div>
        </section>

        <section className="panel section-stack">
          <div>
            <h2>Tournament setup</h2>
            <p className="muted">Build and save the event bracket, then export it as a PNG for Discord.</p>
          </div>
          <div className="workspace-card">
            <span className="card-kicker">Available now</span>
            <h3>Single elimination and three-player advancement</h3>
            <p>Manual or random placement, automatic byes, winner advancement, shared drafts, and PNG export.</p>
          </div>
          {canManageEvent ? (
            <Link className="button" href={`/dashboard/tools/bracket?eventId=${eventId}`}>Open bracket generator</Link>
          ) : null}
        </section>
      </div>

      <section className="panel section-stack">
        <div className="section-header">
          <div>
            <h2>Co-hosts</h2>
            <p>Invited users must accept before they can modify the event.</p>
          </div>
        </div>
        {cohosts.length ? (
          <div className="event-grid">
            {cohosts.map((cohost) => (
              <article className="event-card" key={cohost.id}>
                <span className="card-kicker">{cohost.status}</span>
                <h3>{cohost.global_name ?? cohost.username ?? cohost.invited_discord_id}</h3>
                <p>{cohost.permission_level.replaceAll("_", " ")}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No co-hosts have been invited.</div>
        )}
      </section>

      {canManageEvent ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Invite a co-host</h2>
              <p>Use their permanent Discord user ID. They will see the invitation after logging in.</p>
            </div>
          </div>
          <CohostInviteForm eventId={eventId} />
        </section>
      ) : null}
    </div>
  );
}
