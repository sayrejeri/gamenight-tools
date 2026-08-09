import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformPermissionSnapshot } from "@/lib/permissions";
import { getEffectivePermissions, parsePermissionOverrides, WORKSPACE_PERMISSIONS, WORKSPACE_PERMISSION_INFO, WORKSPACE_ROLE_DEFAULTS, type WorkspacePermission } from "@/lib/permission-catalog";

type WorkspaceAccessRow = RowDataPacket & {
  workspace_id: string; workspace_name: string; role: string; display_label: string | null; status: string;
  permissions_json: string | null; expires_at: Date | null; notes: string | null; last_changed_at: Date | null; changed_by: string | null;
};
type CohostRow = RowDataPacket & { id: string; event_id: string; event_name: string; workspace_name: string; permission_level: string; status: string; expires_at: Date | null };

function effective(row: WorkspaceAccessRow): WorkspacePermission[] {
  const defaults = [...(WORKSPACE_ROLE_DEFAULTS[row.role] ?? [])] as WorkspacePermission[];
  return getEffectivePermissions(defaults, parsePermissionOverrides(row.permissions_json, WORKSPACE_PERMISSIONS), WORKSPACE_PERMISSIONS);
}

export default async function AccessCenterPage() {
  const session = await requireSession();
  const [platform, workspaces, cohosts] = await Promise.all([
    getPlatformPermissionSnapshot(session.userId),
    query<WorkspaceAccessRow[]>(
      `SELECT wm.workspace_id, w.name AS workspace_name, wm.role, wm.display_label, wm.status, wm.permissions_json,
              wm.expires_at, wm.notes, wm.last_changed_at, COALESCE(changer.site_username, changer.global_name, changer.username) AS changed_by
       FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
       LEFT JOIN users changer ON changer.id = wm.last_changed_by
       WHERE wm.user_id = ? AND wm.status <> 'REMOVED' ORDER BY w.name`,
      [session.userId],
    ),
    query<CohostRow[]>(
      `SELECT ec.id, ec.event_id, e.name AS event_name, w.name AS workspace_name, ec.permission_level, ec.status, ec.expires_at
       FROM event_cohosts ec INNER JOIN events e ON e.id = ec.event_id INNER JOIN workspaces w ON w.id = e.workspace_id
       WHERE (ec.invited_user_id = ? OR ec.invited_discord_id = ?) AND ec.status IN ('PENDING', 'ACCEPTED')
       ORDER BY ec.created_at DESC`,
      [session.userId, session.discordId],
    ),
  ]);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Who can do what</span><h1>Access Center</h1><p>See why you have access, where it applies, what permissions are active, and when temporary access expires.</p></div></section>

      {platform.role ? <section className="panel section-stack"><div className="section-header"><div><h2>Platform access</h2><p>Your Game Night Tools-wide staff access.</p></div><span className="badge">{platform.displayLabel ?? platform.role}</span></div><div className="access-summary-card"><div><strong>{platform.displayLabel ?? platform.role}</strong><span>Status: {platform.status?.toLowerCase() ?? "inactive"}{platform.expiresAt ? ` · Expires ${new Date(platform.expiresAt).toLocaleString()}` : " · Permanent"}</span></div><p>{platform.permissions.length ? platform.permissions.map((permission) => permission.replaceAll("_", " ").toLowerCase()).join(" · ") : "No active platform permissions"}</p></div>{platform.permissions.includes("VIEW_BASIC_AUDIT") ? <Link className="button button-secondary" href="/dashboard/audit">Open audit log</Link> : null}</section> : null}

      <section className="panel section-stack"><div className="section-header"><div><h2>Server access</h2><p>Your server roles, private labels, permission grants, suspensions, and temporary access.</p></div><span className="badge dashboard-count">{workspaces.length}</span></div>{workspaces.length ? <div className="access-editor-list">{workspaces.map((item) => { const permissions = effective(item); return <article className="access-summary-card" key={item.workspace_id}><div className="section-header"><div><span className="card-kicker">{item.status}</span><h3>{item.workspace_name}</h3><p>{item.display_label ?? item.role}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : " · permanent"}</p></div><Link className="button button-secondary" href={`/dashboard/workspaces/${item.workspace_id}`}>Open server</Link></div><p>{permissions.length ? permissions.map((permission) => WORKSPACE_PERMISSION_INFO[permission].label).join(" · ") : "No active management capabilities"}</p>{item.notes ? <small className="muted">Private note: {item.notes}</small> : null}{item.last_changed_at ? <small className="muted">Last changed {new Date(item.last_changed_at).toLocaleString()}{item.changed_by ? ` by ${item.changed_by}` : ""}</small> : null}</article>; })}</div> : <div className="empty-state">You do not have any direct server staff access.</div>}</section>

      <section className="panel section-stack"><div className="section-header"><div><h2>Event co-host access</h2><p>Event-specific access is separate from server and platform staff roles.</p></div><span className="badge dashboard-count">{cohosts.length}</span></div>{cohosts.length ? <div className="event-grid">{cohosts.map((item) => <Link className="event-card" href={`/dashboard/events/${item.event_id}`} key={item.id}><span className="card-kicker">{item.workspace_name} · {item.status}</span><h3>{item.event_name}</h3><p>{item.permission_level.replaceAll("_", " ").toLowerCase()}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : ""}</p></Link>)}</div> : <div className="empty-state">You do not have active co-host assignments.</div>}</section>
    </div>
  );
}
