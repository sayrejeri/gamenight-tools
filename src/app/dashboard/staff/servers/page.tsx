import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasPlatformPermission } from "@/lib/permissions";

type ServerRow = RowDataPacket & {
  id: string;
  name: string;
  discord_guild_id: string;
  icon_url: string | null;
  banner_url: string | null;
  main_game_category: string | null;
  profile_status: string;
  verification_level: string | null;
  owner_count: number;
  staff_count: number;
  event_count: number;
  updated_at: Date;
};

export default async function StaffServersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await requireSession();
  if (!await hasPlatformPermission(session.userId, "MANAGE_SERVERS")) notFound();

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const allowedStatuses = ["PENDING", "APPROVED", "CHANGES_REQUESTED", "DENIED", "SUSPENDED", "ARCHIVED"];
  const status = allowedStatuses.includes(params.status ?? "") ? params.status! : "";
  const like = `%${q}%`;

  const servers = await query<ServerRow[]>(
    `SELECT w.id, w.name, w.discord_guild_id, w.icon_url, w.banner_url,
            w.main_game_category, w.profile_status, w.verification_level, w.updated_at,
            (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.status = 'ACTIVE' AND wm.role = 'OWNER') AS owner_count,
            (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.status = 'ACTIVE') AS staff_count,
            (SELECT COUNT(*) FROM events e WHERE e.workspace_id = w.id) AS event_count
     FROM workspaces w
     WHERE (? = '' OR w.name LIKE ? OR w.discord_guild_id = ? OR w.main_game_category LIKE ?)
       AND (? = '' OR w.profile_status = ?)
     ORDER BY FIELD(w.profile_status, 'APPROVED', 'PENDING', 'CHANGES_REQUESTED', 'SUSPENDED', 'DENIED', 'ARCHIVED'), w.name
     LIMIT 200`,
    [q, like, q, like, status, status],
  );

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Platform administration</span><h1>Server profiles</h1><p>Open any registered server profile to correct branding, links, games, webhooks, access roles, or owner Discord IDs.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/staff">Back to staff dashboard</Link><Link className="button button-secondary" href="/dashboard/staff/teams">Team profiles</Link></div>
      </section>

      <form className="staff-user-search" method="get">
        <input name="q" defaultValue={q} placeholder="Search server name or Discord guild ID" />
        <select name="status" defaultValue={status}>
          <option value="">All profile statuses</option>
          {allowedStatuses.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
        <button className="button">Search</button>
      </form>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>{q || status ? "Matching server profiles" : "All server profiles"}</h2><p>{servers.length} profiles shown. Staff with Manage Server Profiles receive management access when opening one.</p></div></div>
        {servers.length ? (
          <div className="organization-grid">
            {servers.map((server) => (
              <Link
                className="organization-card server-banner-card"
                href={`/dashboard/workspaces/${server.id}`}
                key={server.id}
                style={server.banner_url ? { backgroundImage: `linear-gradient(180deg, rgba(17,21,34,.25), rgba(17,21,34,.98)), url(${server.banner_url})` } : undefined}
              >
                <div className="organization-card-top">
                  {server.icon_url ? <img src={server.icon_url} alt="" /> : <span className="organization-logo-fallback">{server.name.slice(0, 2)}</span>}
                  <div><span className="card-kicker">{server.profile_status.replaceAll("_", " ")}</span><h3>{server.name}</h3></div>
                </div>
                <p>Discord guild ID: {server.discord_guild_id}</p>
                <div className="button-row">
                  {server.main_game_category ? <span className="badge">{server.main_game_category}</span> : null}
                  {server.verification_level ? <span className="badge">✓ {server.verification_level.replaceAll("_", " ")}</span> : null}
                  <span className="badge">{server.owner_count} owners</span>
                  <span className="badge">{server.staff_count} access roles</span>
                  <span className="badge">{server.event_count} events</span>
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state">No server profiles matched those filters.</div>}
      </section>
    </div>
  );
}
