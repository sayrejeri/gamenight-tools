import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { isPlatformOwner, requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEventManagerWorkspaceScope } from "@/lib/event-view-access";
import { RedeemCodeForm } from "@/components/redeem-code-form";
import { CohostResponseButtons } from "@/components/cohost-response-buttons";
import { LocalDateTime } from "@/components/local-date-time";

type WorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string; role: string; icon_url: string | null; banner_url: string | null; main_game_category: string | null; verification_level: string | null };
type DiscoveredWorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string; role: string | null; icon_url: string | null; banner_url: string | null; main_game_category: string | null; verification_level: string | null };
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

function WorkspaceCard({ workspace }: { workspace: WorkspaceRow | DiscoveredWorkspaceRow }) {
  return (
    <Link
      className="organization-card server-banner-card"
      href={`/dashboard/workspaces/${workspace.id}`}
      style={workspace.banner_url ? { backgroundImage: `linear-gradient(180deg, rgba(17,21,34,.25), rgba(17,21,34,.98)), url(${workspace.banner_url})` } : undefined}
    >
      <div className="organization-card-top">
        {workspace.icon_url ? <img src={workspace.icon_url} alt="" /> : <span className="organization-logo-fallback">{workspace.name.slice(0, 2)}</span>}
        <div><span className="card-kicker">{workspace.role ?? "SERVER MEMBER"}</span><h3 title={workspace.name}>{workspace.name}</h3></div>
      </div>
      <div className="button-row">
        {workspace.main_game_category ? <span className="badge">{workspace.main_game_category}</span> : null}
        {workspace.verification_level ? <span className="badge">✓ {workspace.verification_level.replaceAll("_", " ")}</span> : null}
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const managerScope = await getEventManagerWorkspaceScope(session.userId);
  const managerSql = managerScope.allWorkspaces
    ? "1 = 1"
    : managerScope.workspaceIds.length
      ? `e.workspace_id IN (${managerScope.workspaceIds.map(() => "?").join(",")})`
      : "1 = 0";

  const [memberships, discovered, events, invitations] = await Promise.all([
    query<WorkspaceRow[]>(
      `SELECT w.id, w.name, w.discord_guild_id, w.icon_url, w.banner_url,
              w.main_game_category, w.verification_level, wm.role
       FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ? AND wm.status = 'ACTIVE' AND w.profile_status = 'APPROVED'
       ORDER BY w.name`,
      [session.userId],
    ),
    query<DiscoveredWorkspaceRow[]>(
      `SELECT w.id, w.name, w.discord_guild_id, w.icon_url, w.banner_url,
              w.main_game_category, w.verification_level, wm.role
       FROM workspaces w
       INNER JOIN user_guilds ug ON ug.guild_id = w.discord_guild_id AND ug.user_id = ?
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.status = 'ACTIVE'
       WHERE w.profile_status = 'APPROVED'
       ORDER BY w.name`,
      [session.userId, session.userId],
    ),
    query<EventRow[]>(
      `SELECT DISTINCT e.id, e.name, e.game_name, e.platform_name, e.subgame_name,
              e.game_thumbnail_url, e.status, e.starts_at, e.timezone,
              w.name AS workspace_name, e.join_code_required
       FROM events e
       INNER JOIN workspaces w ON w.id = e.workspace_id
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
       ORDER BY COALESCE(e.starts_at, '9999-12-31') ASC LIMIT 60`,
      [session.userId, session.userId, session.userId, session.userId, ...managerScope.workspaceIds],
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
        <div><span className="eyebrow">Your control center</span><h1>Game night dashboard</h1><p>Server events appear automatically when your Discord membership matches an approved server profile.</p></div>
        <div className="button-row">
          <Link className="button" href="/dashboard/profile-requests">Request a profile</Link>
          {isPlatformOwner(session.discordId) ? <Link className="button button-secondary" href="/dashboard/admin/setup">Direct server setup</Link> : null}
        </div>
      </section>

      {invitations.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Co-host invitations</h2><p>Accepting lets you modify the event using the permission selected by its host.</p></div><span className="badge dashboard-count">{invitations.length}</span></div><div className="event-grid">{invitations.map((invitation) => <article className="event-card" key={invitation.id}><span className="card-kicker">{invitation.workspace_name}</span><h3>{invitation.event_name}</h3><p>Permission: {invitation.permission_level.replaceAll("_", " ").toLowerCase()}</p><CohostResponseButtons invitationId={invitation.id} /></article>)}</div></section> : null}

      <div className="dashboard-grid dashboard-overview-grid">
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Your workspaces</h2><p>Server profiles where you have an approved role.</p></div><span className="badge dashboard-count">{memberships.length}</span></div>
          {memberships.length ? <div className="dashboard-card-scroll"><div className="organization-grid">{memberships.map((workspace) => <WorkspaceCard workspace={workspace} key={workspace.id} />)}</div></div> : <div className="empty-state">You have not been approved as staff or a host for a server profile yet.</div>}
        </section>
        <section className="panel section-stack"><div className="section-header"><div><h2>Enter a code</h2><p>Redeem a code provided by server staff to join an event or receive host access.</p></div></div><RedeemCodeForm /></section>
      </div>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Registered servers you are in</h2><p>Detected from the Discord servers authorized during login. A bot is not required.</p></div><span className="badge dashboard-count">{uniqueDiscovered.length}</span></div>
        {uniqueDiscovered.length ? <div className="dashboard-card-scroll"><div className="organization-grid">{uniqueDiscovered.map((workspace) => <WorkspaceCard workspace={workspace} key={workspace.id} />)}</div></div> : <div className="empty-state">None of your Discord servers have an approved Game Night Tools profile yet.</div>}
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Events available to you</h2><p>Published server events, assigned events, and your managed drafts appear here.</p></div><span className="badge dashboard-count">{events.length}</span></div>
        {events.length ? <div className="dashboard-card-scroll"><div className="event-grid">{events.map((event) => <Link className="event-card event-card-media" href={`/dashboard/events/${event.id}`} key={event.id}>{event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : <div className="event-image-fallback">GN</div>}<div><span className="card-kicker">{event.workspace_name}</span><h3>{event.name}</h3><p>{event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game not selected"}</p><p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} fallbackTimeZone={event.timezone} includeRelative /></p><span className="badge">{event.status.replaceAll("_", " ")}</span>{event.join_code_required ? <span className="badge">Join code required</span> : null}</div></Link>)}</div></div> : <div className="empty-state">There are no visible upcoming events yet.</div>}
      </section>
    </div>
  );
}
