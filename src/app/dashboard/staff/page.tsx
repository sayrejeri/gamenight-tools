import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformPermissionSnapshot } from "@/lib/permissions";
import { getEffectivePermissions, parsePermissionOverrides, PLATFORM_PERMISSIONS, PLATFORM_ROLE_DEFAULTS, type PlatformPermission } from "@/lib/permission-catalog";
import { StaffReviewControls } from "@/components/staff-review-controls";
import { PlatformStaffForm } from "@/components/platform-staff-form";
import { ReportReviewControls } from "@/components/report-review-controls";

type RequestRow = RowDataPacket & { id: string; request_type: string; requested_name: string; description: string | null; main_platform: string | null; main_game: string | null; applicant_name: string; discord_guild_id: string | null; created_at: Date };
type RawReportRow = RowDataPacket & { id: string; reporter_user_id: string | number; target_type: string; target_id: string; reason: string; details: string | null; status: string; created_at: Date };
type ReportRow = RawReportRow & { reporter_name: string; target_username: string | null; target_display_name: string | null };
type ReportUserRow = RowDataPacket & { id: string | number; site_username: string | null; display_name: string };
type StaffRow = RowDataPacket & { user_id: string; role: string; display_label: string | null; status: string; permissions_json: string | null; expires_at: Date | null; suspended_reason: string | null; name: string; last_changed_at: Date | null; last_changed_by_name: string | null };
type AuditRow = RowDataPacket & { id: string; action_name: string; severity: string; actor_name: string; target_type: string | null; target_id: string | null; created_at: Date };
type CountRow = RowDataPacket & { total: number };
type RecentUserRow = RowDataPacket & { id: string; discord_id: string; display_name: string; site_username: string | null; avatar_hash: string | null; account_status: string; last_login_at: Date };
type SafeQueryResult<T> = { rows: T; failed: boolean; label: string };

async function safeStaffQuery<T extends RowDataPacket[]>(label: string, task: Promise<T>): Promise<SafeQueryResult<T>> {
  try { return { rows: await task, failed: false, label }; }
  catch (error) { console.error(`Staff dashboard query failed: ${label}`, error); return { rows: [] as unknown as T, failed: true, label }; }
}

function staffPermissions(member: StaffRow): PlatformPermission[] {
  const defaults = [...(PLATFORM_ROLE_DEFAULTS[member.role] ?? [])] as PlatformPermission[];
  return getEffectivePermissions(defaults, parsePermissionOverrides(member.permissions_json, PLATFORM_PERMISSIONS), PLATFORM_PERMISSIONS);
}

export default async function StaffDashboardPage() {
  const session = await requireSession();
  const access = await getPlatformPermissionSnapshot(session.userId);
  if (!access.role || !access.permissions.length) notFound();
  const canReviewProfiles = access.permissions.includes("REVIEW_PROFILES");
  const canModerate = access.permissions.includes("MODERATE_USERS") || access.permissions.includes("VIEW_REPORTS");
  const canManageStaff = access.permissions.includes("MANAGE_PLATFORM_STAFF");
  const canViewAudit = access.permissions.includes("VIEW_BASIC_AUDIT") || access.permissions.includes("VIEW_FULL_AUDIT");

  const [requestResult, reportResult, staffResult, auditResult, countResult, recentUserResult] = await Promise.all([
    canReviewProfiles ? safeStaffQuery("profile requests", query<RequestRow[]>(
      `SELECT pr.id, pr.request_type, pr.requested_name, pr.description, pr.main_platform, pr.main_game, pr.discord_guild_id, pr.created_at,
              COALESCE(u.site_username, u.global_name, u.username) AS applicant_name
       FROM profile_requests pr INNER JOIN users u ON u.id = pr.applicant_user_id
       WHERE pr.status = 'PENDING' ORDER BY pr.created_at ASC LIMIT 100`,
    )) : Promise.resolve({ rows: [] as RequestRow[], failed: false, label: "profile requests" }),
    canModerate ? safeStaffQuery("reports", query<RawReportRow[]>(
      `SELECT r.id, r.reporter_user_id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at
       FROM reports r WHERE r.status IN ('OPEN', 'UNDER_REVIEW') ORDER BY r.created_at ASC LIMIT 100`,
    )) : Promise.resolve({ rows: [] as RawReportRow[], failed: false, label: "reports" }),
    canManageStaff ? safeStaffQuery("platform staff", query<StaffRow[]>(
      `SELECT CAST(psr.user_id AS CHAR) AS user_id, psr.role, psr.display_label, psr.status, psr.permissions_json, psr.expires_at,
              psr.suspended_reason, psr.last_changed_at, COALESCE(u.site_username, u.global_name, u.username) AS name,
              COALESCE(changer.site_username, changer.global_name, changer.username) AS last_changed_by_name
       FROM platform_staff_roles psr INNER JOIN users u ON u.id = psr.user_id
       LEFT JOIN users changer ON changer.id = psr.last_changed_by
       WHERE psr.status <> 'REMOVED'
       ORDER BY FIELD(psr.role, 'OWNER', 'ADMIN', 'REVIEWER', 'MODERATOR', 'SUPPORT'), name`,
    )) : Promise.resolve({ rows: [] as StaffRow[], failed: false, label: "platform staff" }),
    canViewAudit ? safeStaffQuery("audit log", query<AuditRow[]>(
      `SELECT al.id, al.action_name, al.severity, al.target_type, al.target_id, al.created_at,
              COALESCE(u.site_username, u.global_name, u.username) AS actor_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE al.is_sensitive = 0 OR ? = 1
       ORDER BY al.created_at DESC LIMIT 20`,
      [access.permissions.includes("VIEW_FULL_AUDIT") ? 1 : 0],
    )) : Promise.resolve({ rows: [] as AuditRow[], failed: false, label: "audit log" }),
    safeStaffQuery("user count", query<CountRow[]>(`SELECT COUNT(*) AS total FROM users`)),
    safeStaffQuery("recent users", query<RecentUserRow[]>(
      `SELECT CAST(id AS CHAR) AS id, discord_id, COALESCE(global_name, username) AS display_name, site_username, avatar_hash, account_status, last_login_at
       FROM users ORDER BY last_login_at DESC LIMIT 8`,
    )),
  ]);

  const reportUserIds = Array.from(new Set(reportResult.rows.flatMap((report) => {
    const ids = [String(report.reporter_user_id)];
    if (report.target_type === "USER" && /^\d+$/.test(report.target_id)) ids.push(report.target_id);
    return ids;
  })));
  const reportUserResult = reportUserIds.length ? await safeStaffQuery("report user details", query<ReportUserRow[]>(
    `SELECT id, site_username, COALESCE(global_name, username) AS display_name FROM users WHERE id IN (${reportUserIds.map(() => "?").join(", ")})`, reportUserIds,
  )) : { rows: [] as ReportUserRow[], failed: false, label: "report user details" };
  const reportUserMap = new Map(reportUserResult.rows.map((user) => [String(user.id), user]));
  const reports: ReportRow[] = reportResult.rows.map((report) => {
    const reporter = reportUserMap.get(String(report.reporter_user_id));
    const reportedUser = report.target_type === "USER" ? reportUserMap.get(report.target_id) : undefined;
    return { ...report, reporter_name: reporter?.site_username ?? reporter?.display_name ?? `User ${String(report.reporter_user_id)}`, target_username: reportedUser?.site_username ?? null, target_display_name: reportedUser?.display_name ?? null };
  });

  const requests = requestResult.rows;
  const staff = staffResult.rows;
  const audit = auditResult.rows;
  const recentUsers = recentUserResult.rows;
  const userCount = Number(countResult.rows[0]?.total ?? 0);
  const failedSections = [requestResult, reportResult, reportUserResult, staffResult, auditResult, countResult, recentUserResult].filter((result) => result.failed).map((result) => result.label);

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Private platform operations</span><h1>Staff dashboard</h1><p>Platform titles and permissions are separate. Your current access determines exactly which sections and actions are available.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/access">Access Center</Link>{canViewAudit ? <Link className="button button-secondary" href="/dashboard/audit">Audit log</Link> : null}<Link className="button button-secondary" href="/dashboard/staff/users">Website users</Link>{access.permissions.includes("MANAGE_SERVERS") ? <Link className="button button-secondary" href="/dashboard/staff/servers">Server profiles</Link> : null}<span className="badge">{access.displayLabel ?? access.role}</span></div>
      </section>
      {failedSections.length ? <p className="staff-query-warning">The dashboard loaded, but these sections could not be read: {failedSections.join(", ")}. The working sections are still available.</p> : null}
      <div className="staff-stat-grid"><article className="stat-card"><strong>{userCount}</strong><span>Website users</span></article><article className="stat-card"><strong>{requests.length}</strong><span>Profile requests</span></article><article className="stat-card"><strong>{reports.length}</strong><span>Open reports</span></article><article className="stat-card"><strong>{staff.length}</strong><span>Managed staff</span></article><article className="stat-card"><strong>{audit.length}</strong><span>Recent actions</span></article></div>

      <section className="panel section-stack"><div className="section-header"><div><h2>Website users</h2><p>Recent people who have signed in with Discord.</p></div><Link className="button" href="/dashboard/staff/users">View all {userCount} users</Link></div>{recentUsers.length ? <div className="staff-user-preview">{recentUsers.map((user) => { const avatarUrl = user.avatar_hash ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar_hash}.png?size=128` : null; return <article className="list-card" key={user.id}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="list-icon">{user.display_name.slice(0, 2)}</span>}<div><strong>{user.display_name}</strong><span>{user.site_username ? `@${user.site_username}` : `Discord ID ${user.discord_id}`}</span><small>Last login {new Date(user.last_login_at).toLocaleString()}</small></div><span className="badge">{user.account_status}</span></article>; })}</div> : <div className="empty-state">No website users could be displayed.</div>}</section>

      {canReviewProfiles ? <section className="panel section-stack"><div className="section-header"><div><h2>Profile approval queue</h2><p>Approve legitimate communities and teams, request changes, or deny incomplete requests.</p></div></div>{requests.length ? <div className="review-grid">{requests.map((item) => <article className="review-card" key={item.id}><span className="card-kicker">{item.request_type} · {item.applicant_name}</span><h3>{item.requested_name}</h3><p>{item.description ?? "No description provided."}</p><div className="button-row">{item.main_platform ? <span className="badge">{item.main_platform}</span> : null}{item.main_game ? <span className="badge">{item.main_game}</span> : null}{item.discord_guild_id ? <span className="badge">Discord verified</span> : null}</div><StaffReviewControls requestId={item.id} /></article>)}</div> : <div className="empty-state">No profiles are waiting for review.</div>}</section> : null}

      {canModerate ? <section className="panel section-stack"><div className="section-header"><div><h2>Reports</h2><p>Claim, review, and resolve website reports.</p></div></div>{reports.length ? <div className="review-grid">{reports.map((report) => <article className="review-card" key={report.id}><span className="card-kicker">{report.target_type} · {report.reason}</span><h3>{report.target_display_name ?? `Target ${report.target_id}`}</h3><p>{report.details ?? "No additional details."}</p><small className="muted">Reported by {report.reporter_name} on {new Date(report.created_at).toLocaleString()}</small><div className="button-row">{report.target_username ? <Link className="button button-secondary" href={`/users/${report.target_username}`}>Open reported profile</Link> : null}<Link className="button button-secondary" href={`/dashboard/staff/users?q=${encodeURIComponent(report.target_id)}`}>Find target in users</Link></div><ReportReviewControls reportId={report.id} currentStatus={report.status} /></article>)}</div> : <div className="empty-state">No open platform reports.</div>}</section> : null}

      {canManageStaff ? <section className="panel section-stack"><div className="section-header"><div><h2>Platform staff</h2><p>Edit roles without removing/re-adding people, use custom visible labels, suspend access, set expirations, copy permissions, and control high-risk capabilities.</p></div></div><PlatformStaffForm staff={staff.map((member) => ({ userId: member.user_id, name: member.name, role: member.role, displayLabel: member.display_label, status: member.status, expiresAt: member.expires_at ? new Date(member.expires_at).toISOString() : null, suspendedReason: member.suspended_reason, permissions: staffPermissions(member), lastChangedAt: member.last_changed_at ? new Date(member.last_changed_at).toISOString() : null, lastChangedBy: member.last_changed_by_name }))} /></section> : null}

      {canViewAudit ? <section className="panel section-stack"><div className="section-header"><div><h2>Audit preview</h2><p>Recent actions. Use the full Audit Log for filters and sensitive entries you are authorized to see.</p></div><Link className="button button-secondary" href="/dashboard/audit">Open audit log</Link></div>{audit.length ? <div className="audit-list">{audit.map((item) => <div className="audit-row" key={item.id}><div><span className={`badge audit-${item.severity.toLowerCase()}`}>{item.severity}</span><strong>{item.action_name.replaceAll(".", " · ").replaceAll("_", " ")}</strong><span>{item.actor_name ?? "Unknown staff user"}{item.target_type ? ` · ${item.target_type} ${item.target_id ?? ""}` : ""}</span></div><time>{new Date(item.created_at).toLocaleString()}</time></div>)}</div> : <div className="empty-state">No staff actions could be displayed.</div>}</section> : null}
    </div>
  );
}
