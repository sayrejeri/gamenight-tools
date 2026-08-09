import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { canViewChannel, communityScopePath, ensureDefaultCommunityChannels, getCommunityScopeAccess, type CommunityChannelType, type CommunityScopeType } from "@/lib/community-chat";

type WorkspaceRow = RowDataPacket & { id: string; name: string; icon_url: string | null; description: string | null };
type TeamRow = RowDataPacket & { id: string; name: string; slug: string; logo_url: string | null; description: string | null; role: string };
type ChannelUnreadRow = RowDataPacket & { id: string; channel_type: CommunityChannelType; unread_count: number };

async function unreadForScope(userId: string, scopeType: CommunityScopeType, scopeId: string) {
  const access = await getCommunityScopeAccess(userId, scopeType, scopeId);
  if (!access?.canRead) return 0;
  await ensureDefaultCommunityChannels(scopeType, scopeId);
  const rows = await query<ChannelUnreadRow[]>(
    `SELECT c.id, c.channel_type,
            (SELECT COUNT(*) FROM community_messages m
             WHERE m.channel_id = c.id AND m.deleted_at IS NULL AND m.author_user_id <> ?
               AND m.created_at > COALESCE(
                 (SELECT r.last_read_at FROM community_channel_reads r WHERE r.channel_id = c.id AND r.user_id = ?),
                 '1970-01-01 00:00:00'
               )) AS unread_count
     FROM community_channels c
     WHERE c.scope_type = ? AND c.scope_id = ? AND c.is_archived = 0`,
    [userId, userId, scopeType, scopeId],
  );
  return rows.filter((row) => canViewChannel(access, row.channel_type)).reduce((total, row) => total + Number(row.unread_count), 0);
}

export default async function CommunityPage() {
  const session = await requireSession();
  const [workspaces, teams] = await Promise.all([
    query<WorkspaceRow[]>(
      `SELECT w.id, w.name, w.icon_url, w.description
       FROM workspaces w
       WHERE w.profile_status = 'APPROVED' AND w.chat_enabled = 1
         AND (
           EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id)
           OR EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.user_id = ? AND wm.workspace_id = w.id AND wm.status = 'ACTIVE' AND (wm.expires_at IS NULL OR wm.expires_at > CURRENT_TIMESTAMP(3)))
         )
       ORDER BY w.name`,
      [session.userId, session.userId],
    ),
    query<TeamRow[]>(
      `SELECT t.id, t.name, t.slug, t.logo_url, t.description, tm.role
       FROM team_members tm INNER JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ? AND tm.status = 'ACTIVE' AND t.profile_status = 'APPROVED' AND t.chat_enabled = 1
       ORDER BY t.name`,
      [session.userId],
    ),
  ]);

  const [workspaceUnread, teamUnread] = await Promise.all([
    Promise.all(workspaces.map(async (workspace) => [workspace.id, await unreadForScope(session.userId, "WORKSPACE", workspace.id)] as const)),
    Promise.all(teams.map(async (team) => [team.id, await unreadForScope(session.userId, "TEAM", team.id)] as const)),
  ]);
  const unreadMap = new Map<string, number>([...workspaceUnread, ...teamUnread]);
  const totalUnread = Array.from(unreadMap.values()).reduce((total, value) => total + value, 0);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Community communication</span><h1>Community</h1><p>Chat with your Discord communities and teams without losing the event, roster, permission, and moderation context around them.</p></div>{totalUnread ? <span className="badge dashboard-count">{totalUnread} unread</span> : null}</section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Server chats</h2><p>Chats enabled by approved Discord-backed server profiles you belong to.</p></div><span className="badge dashboard-count">{workspaces.length}</span></div>
        {workspaces.length ? <div className="community-scope-grid">{workspaces.map((workspace) => { const unread = unreadMap.get(workspace.id) ?? 0; return <Link className="community-scope-card" href={communityScopePath("WORKSPACE", workspace.id)} key={workspace.id}>{workspace.icon_url ? <img src={workspace.icon_url} alt="" /> : <span className="community-scope-icon">{workspace.name.slice(0, 2)}</span>}<div><span className="card-kicker">Server chat</span><h3>{workspace.name}</h3><p>{workspace.description ?? "Community conversation and announcements."}</p></div>{unread ? <span className="chat-unread-count">{unread > 99 ? "99+" : unread}</span> : <span className="badge">Open</span>}</Link>; })}</div> : <div className="empty-state">No server profiles you belong to currently have website chat enabled.</div>}
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Team chats</h2><p>Private channels for teams where you have an active roster role.</p></div><span className="badge dashboard-count">{teams.length}</span></div>
        {teams.length ? <div className="community-scope-grid">{teams.map((team) => { const unread = unreadMap.get(team.id) ?? 0; return <Link className="community-scope-card" href={communityScopePath("TEAM", team.id)} key={team.id}>{team.logo_url ? <img src={team.logo_url} alt="" /> : <span className="community-scope-icon">{team.name.slice(0, 2)}</span>}<div><span className="card-kicker">{team.role} · Team chat</span><h3>{team.name}</h3><p>{team.description ?? "Private team conversation."}</p></div>{unread ? <span className="chat-unread-count">{unread > 99 ? "99+" : unread}</span> : <span className="badge">Open</span>}</Link>; })}</div> : <div className="empty-state">No teams you belong to currently have website chat enabled.</div>}
      </section>
    </div>
  );
}
