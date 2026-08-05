import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { isPlatformOwner, requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { RedeemCodeForm } from "@/components/redeem-code-form";
import { CohostResponseButtons } from "@/components/cohost-response-buttons";
import { LocalDateTime } from "@/components/local-date-time";

type WorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string; role: string };
type DiscoveredWorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string; role: string | null; main_game_category: string | null };
type EventRow = RowDataPacket & {
  id: string;
  name: string;
  game_name: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  game_thumbnail_url: string | null;
  status: string;
  starts_at: Date | null;
  timezone: string;
  workspace_name: string;
  join_code_required: number;
};
type InvitationRow = RowDataPacket & { id: string; event_name: string; workspace_name: string; permission_level: string };

export default async function DashboardPage() {
  const session = await requireSession();
  const [memberships, discovered, events, invitations] = await Promise.all([
    query<WorkspaceRow[]>(
      `SELECT w.id, w.name, w.discord_guild_id, wm.role
       FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ? AND wm.status = 'ACTIVE' ORDER BY w.name`,
      [session.userId],
    ),
    query<DiscoveredWorkspaceRow[]>(
      `SELECT w.id, w.name, w.discord_guild_id, w.main_game_category, wm.role
       FROM workspaces w
       INNER JOIN user_guilds ug ON ug.guild_id = w.discord_guild_id AND ug.user_id = ?
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.status = 'ACTIVE'
       ORDER BY w.name`,
      [session.userId, session.userId],
    ),
    query<EventRow[]>(
      `SELECT DISTINCT e.id, e.name, e.game_name, e.platform_name, e.subgame_name,
              e.game_thumbnail_url, e.status, e.starts_at, e.timezone,
              w.name AS workspace_name, e.join_code_required
       FROM events e
       INNER JOIN workspaces w ON w.id = e.workspace_id
       LEFT JOIN workspace_members wm ON wm.workspace_id = e.workspace_id AND wm.user_id = ? AND wm.status = 'ACTIVE'
       LEFT JOIN user_guilds ug ON ug.user_id = ? AND ug.guild_id = w.discord_guild_id
       LEFT JOIN event_participants ep ON ep.event_id = e.id AND ep.user_id = ?
       LEFT JOIN event_cohosts ec ON ec.event_id = e.id AND ec.invited_user_id = ? AND ec.status = 'ACCEPTED'
       WHERE (e.status NOT IN ('DRAFT', 'AWAITING_APPROVAL') AND e.visibility = 'PUBLIC')
          OR wm.user_id IS NOT NULL
          OR ep.user_id IS NOT NULL
          OR ec.invited_user_id IS NOT NULL
          OR (e.status NOT IN ('DRAFT', 'AWAITING_APPROVAL') AND ug.user_id IS NOT NULL AND e.visibility = 'SERVER')
       ORDER BY COALESCE(e.starts_at, '9999-12-31') ASC LIMIT 20`,
      [session.userId, session.userId, session.userId, session.userId],
    ),
    query<InvitationRow[]>(
      `SELECT ec.id, e.name AS event_name, w.name AS workspace_name, ec.permission_level
       FROM event_cohosts ec
       INNER JOIN events e ON e.id = ec.event_id
       INNER JOIN workspaces w ON w.id = e.workspace_id
       WHERE ec.invited_discord_id = ? AND ec.status = 'PENDING'
         AND (ec.expires_at IS NULL OR ec.expires_at > CURRENT_TIMESTAMP(3))
       ORDER BY ec.created_at DESC`,
      [session.discordId],
    ),
  ]);

  const uniqueDiscovered = discovered.filter((workspace, index, all) => all.findIndex((item) => item.id === workspace.id) === index);

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Your control center</span><h1>Game night dashboard</h1><p>Server events appear automatically when your Discord membership matches a registered workspace.</p></div>
        {isPlatformOwner(session.discordId) ? <Link className="button button-secondary" href="/dashboard/admin/setup">Create server profile</Link> : null}
      </section>

      {invitations.length ? (
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Co-host invitations</h2><p>Accepting lets you modify the event using the permission selected by its host.</p></div></div>
          <div className="event-grid">
            {invitations.map((invitation) => (
              <article className="event-card" key={invitation.id}>
                <span className="card-kicker">{invitation.workspace_name}</span><h3>{invitation.event_name}</h3>
                <p>Permission: {invitation.permission_level.replaceAll("_", " ").toLowerCase()}</p>
                <CohostResponseButtons invitationId={invitation.id} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="dashboard-grid">
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Your workspaces</h2><p>Server profiles where you have an approved role.</p></div></div>
          {memberships.length ? (
            <div className="workspace-grid">
              {memberships.map((workspace) => (
                <Link className="workspace-card" href={`/dashboard/workspaces/${workspace.id}`} key={workspace.id}>
                  <span className="card-kicker">{workspace.role}</span><h3>{workspace.name}</h3><p>Discord server ID: {workspace.discord_guild_id}</p>
                </Link>
              ))}
            </div>
          ) : <div className="empty-state">You have not been approved as staff or a host for a server profile yet.</div>}
        </section>

        <section className="panel section-stack">
          <div className="section-header"><div><h2>Enter a code</h2><p>Redeem a code provided by server staff to join an event or receive host access.</p></div></div>
          <RedeemCodeForm />
        </section>
      </div>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Registered servers you are in</h2><p>Detected from the Discord servers authorized during login. A bot is not required.</p></div></div>
        {uniqueDiscovered.length ? (
          <div className="workspace-grid">
            {uniqueDiscovered.map((workspace) => (
              <Link className="workspace-card" href={`/dashboard/workspaces/${workspace.id}`} key={workspace.id}>
                <span className="card-kicker">{workspace.role ?? "SERVER MEMBER"}</span><h3>{workspace.name}</h3>
                <p>{workspace.main_game_category ?? (workspace.role ? "You have workspace access." : "You can see member-visible events.")}</p>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state">None of your Discord servers have a Game Night Tools profile yet.</div>}
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Events available to you</h2><p>Published server events, assigned events, and your managed drafts appear here.</p></div></div>
        {events.length ? (
          <div className="event-grid">
            {events.map((event) => (
              <Link className="event-card event-card-media" href={`/dashboard/events/${event.id}`} key={event.id}>
                {event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : null}
                <div>
                  <span className="card-kicker">{event.workspace_name}</span><h3>{event.name}</h3>
                  <p>{event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game not selected"}</p>
                  <p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} fallbackTimeZone={event.timezone} includeRelative /></p>
                  <span className="badge">{event.status.replaceAll("_", " ")}</span>
                  {event.join_code_required ? <span className="badge">Join code required</span> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state">There are no visible upcoming events yet.</div>}
      </section>
    </div>
  );
}
