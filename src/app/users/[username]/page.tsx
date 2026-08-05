import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { buildConnectionProfileUrl, formatConnectionType } from "@/lib/connections";
import { PlatformIcon } from "@/components/platform-icon";
import { LocalDateTime } from "@/components/local-date-time";
import { BrandMark } from "@/components/brand-mark";

type UserRow = RowDataPacket & {
  id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  site_username: string;
  avatar_hash: string | null;
  bio: string | null;
  banner_url: string | null;
  main_platform: string | null;
  profile_visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  account_status: string;
  created_at: Date;
  show_game_identities: number;
  show_event_history: number;
  show_teams: number;
  show_servers: number;
};
type ConnectionRow = RowDataPacket & { connection_type: string; external_id: string | null; handle: string; display_name: string | null; profile_url: string | null; avatar_url: string | null; is_verified: number };
type TeamRow = RowDataPacket & { id: string; slug: string; name: string; tag: string | null; logo_url: string | null; role: string };
type WorkspaceRow = RowDataPacket & { id: string; name: string; icon_url: string | null; banner_url: string | null; role: string };
type EventRow = RowDataPacket & { id: string; name: string; status: string; starts_at: Date | null; workspace_name: string; placement: string | null };

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const viewer = await readSession();
  const { username } = await params;
  const rows = await query<UserRow[]>(
    `SELECT u.id, u.discord_id, u.username, u.global_name, u.site_username, u.avatar_hash,
            u.bio, u.banner_url, u.main_platform, u.profile_visibility, u.account_status,
            u.created_at, COALESCE(up.show_game_identities, 1) AS show_game_identities,
            COALESCE(up.show_event_history, 1) AS show_event_history,
            COALESCE(up.show_teams, 1) AS show_teams, COALESCE(up.show_servers, 1) AS show_servers
     FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE LOWER(u.site_username) = LOWER(?) LIMIT 1`,
    [username],
  );
  const user = rows[0];
  if (!user || user.account_status !== "ACTIVE") notFound();
  const isOwner = viewer?.userId === user.id;
  if (user.profile_visibility === "PRIVATE" && !isOwner) notFound();
  if (user.profile_visibility === "MEMBERS" && !viewer) notFound();

  if (viewer && !isOwner) {
    const blocked = await query<RowDataPacket[]>(
      `SELECT blocker_user_id FROM user_blocks
       WHERE (blocker_user_id = ? AND blocked_user_id = ?)
          OR (blocker_user_id = ? AND blocked_user_id = ?)
       LIMIT 1`,
      [viewer.userId, user.id, user.id, viewer.userId],
    );
    if (blocked[0]) notFound();
  }

  const [connections, teams, workspaces, events] = await Promise.all([
    user.show_game_identities || isOwner ? query<ConnectionRow[]>(
      `SELECT connection_type, external_id, handle, display_name, profile_url, avatar_url, is_verified
       FROM user_connections WHERE user_id = ? AND (is_visible = 1 OR ? = 1)
       ORDER BY is_verified DESC, connection_type ASC`,
      [user.id, isOwner ? 1 : 0],
    ) : Promise.resolve([] as ConnectionRow[]),
    user.show_teams || isOwner ? query<TeamRow[]>(
      `SELECT t.id, t.slug, t.name, t.tag, t.logo_url, tm.role
       FROM team_members tm INNER JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ? AND tm.status = 'ACTIVE' AND t.profile_status = 'APPROVED'
       ORDER BY t.name`,
      [user.id],
    ) : Promise.resolve([] as TeamRow[]),
    user.show_servers || isOwner ? query<WorkspaceRow[]>(
      `SELECT w.id, w.name, w.icon_url, w.banner_url, wm.role
       FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ? AND wm.status = 'ACTIVE' AND w.profile_status = 'APPROVED'
       ORDER BY w.name`,
      [user.id],
    ) : Promise.resolve([] as WorkspaceRow[]),
    user.show_event_history || isOwner ? query<EventRow[]>(
      `SELECT e.id, e.name, e.status, e.starts_at, w.name AS workspace_name,
              JSON_UNQUOTE(JSON_EXTRACT(ep_answers.answers_json, '$.placement')) AS placement
       FROM event_participants ep
       INNER JOIN events e ON e.id = ep.event_id
       INNER JOIN workspaces w ON w.id = e.workspace_id
       LEFT JOIN (
         SELECT event_id, user_id, NULL AS answers_json FROM event_participants
       ) ep_answers ON ep_answers.event_id = ep.event_id AND ep_answers.user_id = ep.user_id
       WHERE ep.user_id = ? AND ep.status NOT IN ('REJECTED', 'WITHDRAWN')
         AND e.status IN ('LIVE', 'COMPLETED')
       ORDER BY COALESCE(e.starts_at, e.created_at) DESC LIMIT 12`,
      [user.id],
    ) : Promise.resolve([] as EventRow[]),
  ]);

  const avatarUrl = getDiscordAvatarUrl(user.discord_id, user.avatar_hash);
  return (
    <main className="public-shell section-stack">
      <header className="public-topbar"><BrandMark href="/" /><div className="button-row">{viewer ? <Link className="button button-secondary" href="/dashboard">Dashboard</Link> : <a className="button" href="/api/auth/discord/login">Sign in</a>}</div></header>
      <section className="profile-hero" style={user.banner_url ? { backgroundImage: `linear-gradient(90deg, rgba(9,11,18,.94), rgba(9,11,18,.55)), url(${user.banner_url})` } : undefined}>
        <div className="profile-hero-user">
          {avatarUrl ? <img className="profile-avatar" src={avatarUrl} alt="" /> : <span className="profile-avatar avatar-fallback">{(user.global_name ?? user.username).slice(0, 1).toUpperCase()}</span>}
          <div><span className="eyebrow">@{user.site_username}</span><h1>{user.global_name ?? user.username}</h1><p>{user.bio ?? "This player has not added a bio yet."}</p><div className="button-row">{user.main_platform ? <span className="badge">Main platform: {user.main_platform}</span> : null}<span className="badge">Member since {new Date(user.created_at).getFullYear()}</span></div></div>
        </div>
        {isOwner ? <Link className="button" href="/dashboard/settings">Edit profile</Link> : null}
      </section>

      {connections.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Game identities</h2><p>Accounts this player has chosen to display.</p></div></div><div className="identity-grid">{connections.map((connection) => {
        const href = buildConnectionProfileUrl(connection.connection_type, connection.external_id, connection.handle, connection.profile_url);
        const card = <div className="identity-card"><PlatformIcon type={connection.connection_type} avatarUrl={connection.avatar_url} size="large" /><div><span>{formatConnectionType(connection.connection_type)}</span><strong className="identity-name">{connection.display_name || connection.handle}</strong>{connection.is_verified ? <span className="badge">Resolved</span> : null}</div></div>;
        return href ? <a href={href} target="_blank" rel="noreferrer" key={`${connection.connection_type}-${connection.handle}`}>{card}</a> : <div key={`${connection.connection_type}-${connection.handle}`}>{card}</div>;
      })}</div></section> : null}

      <div className="dashboard-grid">
        <section className="panel section-stack"><div className="section-header"><div><h2>Teams</h2><p>Active competitive rosters.</p></div></div>{teams.length ? <div className="compact-list">{teams.map((team) => <Link className="list-card" href={`/teams/${team.slug}`} key={team.id}>{team.logo_url ? <img src={team.logo_url} alt="" /> : <span className="list-icon">{team.tag?.slice(0, 2) ?? team.name.slice(0, 2)}</span>}<div><strong>{team.name}</strong><span>{team.role.toLowerCase()}</span></div></Link>)}</div> : <div className="empty-state">No public team memberships.</div>}</section>
        <section className="panel section-stack"><div className="section-header"><div><h2>Server roles</h2><p>Approved server profiles this member helps run.</p></div></div>{workspaces.length ? <div className="compact-list">{workspaces.map((workspace) => <Link className="list-card" href={`/dashboard/workspaces/${workspace.id}`} key={workspace.id}>{workspace.icon_url ? <img src={workspace.icon_url} alt="" /> : <span className="list-icon">{workspace.name.slice(0, 2)}</span>}<div><strong>{workspace.name}</strong><span>{workspace.role.toLowerCase()}</span></div></Link>)}</div> : <div className="empty-state">No public server roles.</div>}</section>
      </div>

      {events.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Recent events</h2><p>Completed and currently live events.</p></div></div><div className="event-grid">{events.map((event) => <Link className="event-card" href={`/dashboard/events/${event.id}`} key={event.id}><span className="card-kicker">{event.workspace_name}</span><h3>{event.name}</h3><p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} /></p><span className="badge">{event.status.replaceAll("_", " ")}</span></Link>)}</div></section> : null}
    </main>
  );
}
