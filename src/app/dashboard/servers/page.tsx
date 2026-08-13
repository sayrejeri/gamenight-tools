import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";

type ServerRow = RowDataPacket & { id: string; name: string; description: string | null; icon_url: string | null; banner_url: string | null; main_game_category: string | null; verification_level: string | null; role: string | null; is_discord_member: number; event_count: number };

function ServerCard({ server }: { server: ServerRow }) {
  return <Link className="organization-card server-banner-card" href={`/dashboard/workspaces/${server.id}`} style={server.banner_url ? { backgroundImage: `linear-gradient(180deg, rgba(17,21,34,.28), rgba(17,21,34,.98)), url(${server.banner_url})` } : undefined}><div className="organization-card-top">{server.icon_url ? <img src={server.icon_url} alt="" /> : <span className="organization-logo-fallback">{server.name.slice(0, 2)}</span>}<div><span className="card-kicker">{server.role ?? (server.is_discord_member ? "SERVER MEMBER" : "COMMUNITY")}</span><h3>{server.name}</h3></div></div><p>{server.description ?? "Game Night Tools server profile."}</p><div className="button-row">{server.main_game_category ? <span className="badge">{server.main_game_category}</span> : null}{server.verification_level ? <span className="badge">✓ {server.verification_level.replaceAll("_", " ")}</span> : null}<span className="badge">{server.event_count} upcoming events</span></div></Link>;
}

export default async function ServersPage() {
  const session = await requireSession();
  const servers = await query<ServerRow[]>(
    `SELECT w.id, w.name, w.description, w.icon_url, w.banner_url, w.main_game_category,
            w.verification_level, wm.role,
            EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id) AS is_discord_member,
            (SELECT COUNT(*) FROM events e WHERE e.workspace_id = w.id AND e.status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'COMPLETED', 'CANCELLED')) AS event_count
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.status = 'ACTIVE'
     WHERE w.profile_status = 'APPROVED'
       AND (wm.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM user_guilds ug2 WHERE ug2.user_id = ? AND ug2.guild_id = w.discord_guild_id) OR w.is_featured = 1)
     ORDER BY w.is_featured DESC, wm.role IS NULL, w.name`,
    [session.userId, session.userId, session.userId],
  );
  return <div className="section-stack"><section className="page-heading"><div><span className="eyebrow">Discord communities</span><h1>Server profiles</h1><p>Profiles from servers you belong to, communities you help run, and featured Game Night Tools partners.</p></div><div className="button-row"><Link className="button button-secondary" href="/dashboard/team-server-identity">Team &amp; server identity</Link><Link className="button" href="/dashboard/profile-requests">Request a server profile</Link></div></section><section className="panel section-stack"><div className="section-header"><div><h2>Your communities</h2><p>Banner artwork, verified links, upcoming events, and server tools live inside each profile.</p></div></div>{servers.length ? <div className="organization-grid">{servers.map((server) => <ServerCard server={server} key={server.id} />)}</div> : <div className="empty-state">None of your Discord servers have an approved profile yet.</div>}</section></div>;
}
