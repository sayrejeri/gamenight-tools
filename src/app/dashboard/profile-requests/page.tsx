import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { ProfileRequestForm } from "@/components/profile-request-form";

type GuildRow = RowDataPacket & { guild_id: string; guild_name: string; is_owner: number };
type WorkspaceRow = RowDataPacket & { id: string; name: string };
type RequestRow = RowDataPacket & { id: string; request_type: string; requested_name: string; status: string; review_reason: string | null; created_at: Date };

export default async function ProfileRequestsPage() {
  const session = await requireSession();
  const [guilds, workspaces, requests] = await Promise.all([
    query<GuildRow[]>(`SELECT guild_id, guild_name, is_owner FROM user_guilds WHERE user_id = ? ORDER BY is_owner DESC, guild_name`, [session.userId]),
    query<WorkspaceRow[]>(
      `SELECT w.id, w.name FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ? AND wm.status = 'ACTIVE' AND wm.role IN ('OWNER', 'ADMIN') ORDER BY w.name`,
      [session.userId],
    ),
    query<RequestRow[]>(
      `SELECT id, request_type, requested_name, status, review_reason, created_at
       FROM profile_requests WHERE applicant_user_id = ? ORDER BY created_at DESC`,
      [session.userId],
    ),
  ]);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Organizations</span><h1>Server and team profiles</h1><p>Request a verified profile for a Discord community or competitive team. Platform staff reviews every request before it becomes public.</p></div></section>
      <ProfileRequestForm guilds={guilds.map((guild) => ({ id: guild.guild_id, name: guild.guild_name, isOwner: Boolean(guild.is_owner) }))} workspaces={workspaces} />
      <section className="panel section-stack"><div className="section-header"><div><h2>Your requests</h2><p>Staff decisions and requested changes appear here.</p></div></div>{requests.length ? <div className="request-list">{requests.map((item) => <article className="list-card request-card" key={item.id}><span className="list-icon">{item.request_type.slice(0, 1)}</span><div><strong>{item.requested_name}</strong><span>{item.request_type.toLowerCase()} profile · {item.status.toLowerCase().replaceAll("_", " ")}</span>{item.review_reason ? <p>{item.review_reason}</p> : null}</div><span className="badge">{new Date(item.created_at).toLocaleDateString()}</span></article>)}</div> : <div className="empty-state">You have not submitted a profile request yet.</div>}</section>
    </div>
  );
}
