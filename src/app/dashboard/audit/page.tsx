import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformPermissionSnapshot, hasWorkspacePermission } from "@/lib/permissions";

type AuditRow = RowDataPacket & {
  id: string; workspace_id: string | null; workspace_name: string | null; event_id: string | null;
  action_name: string; severity: string; is_sensitive: number; target_type: string | null; target_id: string | null;
  details_json: string | null; created_at: Date; actor_user_id: string; actor_name: string;
};
type ActorRow = RowDataPacket & { id: string; name: string };
type WorkspaceRow = RowDataPacket & { id: string; name: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ workspace?: string; action?: string; actor?: string; severity?: string; target?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const platform = await getPlatformPermissionSnapshot(session.userId);
  const platformBasic = platform.permissions.includes("VIEW_BASIC_AUDIT") || platform.permissions.includes("VIEW_FULL_AUDIT");
  const platformFull = platform.permissions.includes("VIEW_FULL_AUDIT");
  const workspaceId = params.workspace?.trim() || null;
  const workspaceBasic = workspaceId ? await hasWorkspacePermission(session.userId, workspaceId, "VIEW_BASIC_AUDIT") : false;
  const workspaceFull = workspaceId ? await hasWorkspacePermission(session.userId, workspaceId, "VIEW_FULL_AUDIT") : false;
  const canView = workspaceId ? platformBasic || workspaceBasic || workspaceFull : platformBasic;
  const canViewSensitive = platformFull || workspaceFull;
  if (!canView) notFound();

  const where: string[] = [];
  const values: unknown[] = [];
  if (workspaceId) { where.push("al.workspace_id = ?"); values.push(workspaceId); }
  if (params.action?.trim()) { where.push("al.action_name LIKE ?"); values.push(`%${params.action.trim()}%`); }
  if (params.actor?.trim()) { where.push("CAST(al.actor_user_id AS CHAR) = ?"); values.push(params.actor.trim()); }
  if (params.severity && ["INFO", "MODERATION", "PERMISSIONS", "SECURITY"].includes(params.severity)) { where.push("al.severity = ?"); values.push(params.severity); }
  if (params.target?.trim()) { where.push("(al.target_id LIKE ? OR al.target_type LIKE ?)"); values.push(`%${params.target.trim()}%`, `%${params.target.trim()}%`); }
  if (!canViewSensitive) where.push("al.is_sensitive = 0");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [audit, actors, workspaces] = await Promise.all([
    query<AuditRow[]>(
      `SELECT al.id, al.workspace_id, w.name AS workspace_name, al.event_id, al.action_name, al.severity, al.is_sensitive,
              al.target_type, al.target_id, al.details_json, al.created_at, CAST(al.actor_user_id AS CHAR) AS actor_user_id,
              COALESCE(u.site_username, u.global_name, u.username) AS actor_name
       FROM audit_logs al
       INNER JOIN users u ON u.id = al.actor_user_id
       LEFT JOIN workspaces w ON w.id = al.workspace_id
       ${whereSql}
       ORDER BY al.created_at DESC LIMIT 300`, values,
    ),
    query<ActorRow[]>(`SELECT DISTINCT CAST(u.id AS CHAR) AS id, COALESCE(u.site_username, u.global_name, u.username) AS name FROM audit_logs al INNER JOIN users u ON u.id = al.actor_user_id ORDER BY name LIMIT 200`),
    platformBasic ? query<WorkspaceRow[]>(`SELECT id, name FROM workspaces WHERE profile_status NOT IN ('ARCHIVED') ORDER BY name`) : Promise.resolve([] as WorkspaceRow[]),
  ]);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Accountability and security</span><h1>Audit log</h1><p>{canViewSensitive ? "You can view normal and sensitive permission/security activity." : "You can view basic administrative activity. Sensitive security details are hidden."}</p></div><span className="badge">{canViewSensitive ? "FULL AUDIT" : "BASIC AUDIT"}</span></section>
      <section className="panel section-stack">
        <form className="audit-filter-grid" method="get">
          {platformBasic ? <div className="form-stack compact"><label>Server</label><select name="workspace" defaultValue={workspaceId ?? ""}><option value="">All platform activity</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select></div> : <input type="hidden" name="workspace" value={workspaceId ?? ""} />}
          <div className="form-stack compact"><label>Action</label><input name="action" defaultValue={params.action ?? ""} placeholder="webhook, member, report…" /></div>
          <div className="form-stack compact"><label>Staff member</label><select name="actor" defaultValue={params.actor ?? ""}><option value="">Anyone</option>{actors.map((actor) => <option value={actor.id} key={actor.id}>{actor.name}</option>)}</select></div>
          <div className="form-stack compact"><label>Severity</label><select name="severity" defaultValue={params.severity ?? ""}><option value="">Any</option><option value="INFO">Info</option><option value="MODERATION">Moderation</option><option value="PERMISSIONS">Permissions</option><option value="SECURITY">Security</option></select></div>
          <div className="form-stack compact"><label>Target</label><input name="target" defaultValue={params.target ?? ""} placeholder="User, webhook, ID…" /></div>
          <button className="button">Apply filters</button>
        </form>
      </section>
      <section className="panel section-stack"><div className="section-header"><div><h2>Recent actions</h2><p>Up to 300 matching records are shown.</p></div><span className="badge dashboard-count">{audit.length}</span></div>{audit.length ? <div className="audit-list">{audit.map((item) => <article className="audit-row audit-row-expanded" key={item.id}><div><div className="button-row"><span className={`badge audit-${item.severity.toLowerCase()}`}>{item.severity}</span>{item.workspace_name ? <span className="badge">{item.workspace_name}</span> : null}</div><strong>{item.action_name.replaceAll(".", " · ").replaceAll("_", " ")}</strong><span>{item.actor_name}{item.target_type ? ` · ${item.target_type} ${item.target_id ?? ""}` : ""}</span>{canViewSensitive && item.details_json ? <details><summary>View details</summary><pre className="audit-details">{JSON.stringify(JSON.parse(item.details_json), null, 2)}</pre></details> : null}</div><time>{new Date(item.created_at).toLocaleString()}</time></article>)}</div> : <div className="empty-state">No audit records match these filters.</div>}</section>
    </div>
  );
}
