import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { canManagePlatformStaff, canModeratePlatform, canReviewProfiles, getPlatformRole } from "@/lib/platform-access";
import { StaffReviewControls } from "@/components/staff-review-controls";
import { PlatformStaffForm } from "@/components/platform-staff-form";
import { ReportReviewControls } from "@/components/report-review-controls";

type RequestRow = RowDataPacket & { id: string; request_type: string; requested_name: string; description: string | null; main_platform: string | null; main_game: string | null; applicant_name: string; discord_guild_id: string | null; created_at: Date };
type ReportRow = RowDataPacket & { id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; reporter_name: string; target_username: string | null; target_display_name: string | null; created_at: Date };
type StaffRow = RowDataPacket & { user_id: string; role: string; name: string };
type AuditRow = RowDataPacket & { id: string; action_name: string; actor_name: string; target_type: string | null; target_id: string | null; created_at: Date };
type CountRow = RowDataPacket & { total: number };
type RecentUserRow = RowDataPacket & { id: string; discord_id: string; display_name: string; site_username: string | null; avatar_hash: string | null; account_status: string; last_login_at: Date };

export default async function StaffDashboardPage() {
  const session = await requireSession();
  const role = await getPlatformRole(session.userId);
  if (!role) notFound();

  const [requests, reports, staff, audit, userCounts, recentUsers] = await Promise.all([
    canReviewProfiles(role) ? query<RequestRow[]>(
      `SELECT pr.id, pr.request_type, pr.requested_name, pr.description, pr.main_platform,
              pr.main_game, pr.discord_guild_id, pr.created_at,
              COALESCE(u.site_username, u.global_name, u.username) AS applicant_name
       FROM profile_requests pr INNER JOIN users u ON u.id = pr.applicant_user_id
       WHERE pr.status = 'PENDING' ORDER BY pr.created_at ASC LIMIT 100`,
    ) : Promise.resolve([] as RequestRow[]),
    canModeratePlatform(role) ? query<ReportRow[]>(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
              COALESCE(reporter.site_username, reporter.global_name, reporter.username) AS reporter_name,
              target.site_username AS target_username,
              COALESCE(target.global_name, target.username) AS target_display_name
       FROM reports r
       INNER JOIN users reporter ON reporter.id = r.reporter_user_id
       LEFT JOIN users target ON r.target_type = 'USER' AND CAST(target.id AS CHAR) = r.target_id
       WHERE r.status IN ('OPEN', 'UNDER_REVIEW') ORDER BY r.created_at ASC LIMIT 100`,
    ) : Promise.resolve([] as ReportRow[]),
    canManagePlatformStaff(role) ? query<StaffRow[]>(
      `SELECT psr.user_id, psr.role, COALESCE(u.site_username, u.global_name, u.username) AS name
       FROM platform_staff_roles psr INNER JOIN users u ON u.id = psr.user_id
       WHERE psr.status = 'ACTIVE' ORDER BY FIELD(psr.role, 'OWNER', 'ADMIN', 'REVIEWER', 'MODERATOR', 'SUPPORT'), name`,
    ) : Promise.resolve([] as StaffRow[]),
    query<AuditRow[]>(
      `SELECT al.id, al.action_name, al.target_type, al.target_id, al.created_at,
              COALESCE(u.site_username, u.global_name, u.username) AS actor_name
       FROM audit_logs al INNER JOIN users u ON u.id = al.actor_user_id
       WHERE al.action_name LIKE 'profile_request.%' OR al.action_name LIKE 'platform_staff.%'
          OR al.action_name LIKE 'report.%' OR al.action_name LIKE 'workspace.%'
          OR al.action_name LIKE 'platform_user.%'
       ORDER BY al.created_at DESC LIMIT 30`,
    ),
    query<CountRow[]>(`SELECT COUNT(*) AS total FROM users`),
    query<RecentUserRow[]>(
      `SELECT CAST(id AS CHAR) AS id, discord_id, COALESCE(global_name, username) AS display_name,
              site_username, avatar_hash, account_status, last_login_at
       FROM users ORDER BY last_login_at DESC LIMIT 8`,
    ),
  ]);

  const userCount = Number(userCounts[0]?.total ?? 0);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Private platform operations</span><h1>Staff dashboard</h1><p>Review organization profiles, handle reports, manage platform staff, inspect website users, and audit administrative actions.</p></div><span className="badge">{role}</span></section>
      <div className="staff-stat-grid"><article className="stat-card"><strong>{userCount}</strong><span>Website users</span></article><article className="stat-card"><strong>{requests.length}</strong><span>Profile requests</span></article><article className="stat-card"><strong>{reports.length}</strong><span>Open reports</span></article><article className="stat-card"><strong>{staff.length || 1}</strong><span>Platform staff</span></article><article className="stat-card"><strong>{audit.length}</strong><span>Recent actions</span></article></div>

      <section className="panel section-stack"><div className="section-header"><div><h2>Website users</h2><p>Every person who has signed in with Discord is stored as a Game Night Tools user.</p></div><Link className="button" href="/dashboard/staff/users">View all {userCount} users</Link></div>{recentUsers.length ? <div className="staff-user-preview">{recentUsers.map((user) => { const avatarUrl = user.avatar_hash ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar_hash}.png?size=128` : null; return <article className="list-card" key={user.id}>{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="list-icon">{user.display_name.slice(0, 2)}</span>}<div><strong>{user.display_name}</strong><span>{user.site_username ? `@${user.site_username}` : `Discord ID ${user.discord_id}`}</span><small>Last login {new Date(user.last_login_at).toLocaleString()}</small></div><span className="badge">{user.account_status}</span></article>; })}</div> : <div className="empty-state">No website users have signed in yet.</div>}</section>

      {canReviewProfiles(role) ? <section className="panel section-stack"><div className="section-header"><div><h2>Profile approval queue</h2><p>Approve legitimate communities and teams, request changes, or deny impersonation and incomplete requests.</p></div></div>{requests.length ? <div className="review-grid">{requests.map((item) => <article className="review-card" key={item.id}><span className="card-kicker">{item.request_type} · {item.applicant_name}</span><h3>{item.requested_name}</h3><p>{item.description ?? "No description provided."}</p><div className="button-row">{item.main_platform ? <span className="badge">{item.main_platform}</span> : null}{item.main_game ? <span className="badge">{item.main_game}</span> : null}{item.discord_guild_id ? <span className="badge">Discord verified</span> : null}</div><StaffReviewControls requestId={item.id} /></article>)}</div> : <div className="empty-state">No profiles are waiting for review.</div>}</section> : null}

      {canModeratePlatform(role) ? <section className="panel section-stack"><div className="section-header"><div><h2>Reports</h2><p>Profile reports and other platform reports show only to authorized moderators and administrators.</p></div></div>{reports.length ? <div className="review-grid">{reports.map((report) => <article className="review-card" key={report.id}><span className="card-kicker">{report.target_type} · {report.reason}</span><h3>{report.target_display_name ?? `Target ${report.target_id}`}</h3><p>{report.details ?? "No additional details."}</p><small className="muted">Reported by {report.reporter_name} on {new Date(report.created_at).toLocaleString()}</small><div className="button-row">{report.target_username ? <Link className="button button-secondary" href={`/users/${report.target_username}`}>Open reported profile</Link> : null}<Link className="button button-secondary" href={`/dashboard/staff/users?q=${encodeURIComponent(report.target_id)}`}>Find target in users</Link></div><ReportReviewControls reportId={report.id} currentStatus={report.status} /></article>)}</div> : <div className="empty-state">No open platform reports.</div>}</section> : null}

      {canManagePlatformStaff(role) ? <section className="panel section-stack"><div className="section-header"><div><h2>Platform staff</h2><p>Assign scoped access without sharing accounts. Platform owners and admins can also modify approved server profiles.</p></div></div><PlatformStaffForm staff={staff.map((member) => ({ userId: member.user_id, name: member.name, role: member.role }))} /></section> : null}

      <section className="panel section-stack"><div className="section-header"><div><h2>Moderation audit trail</h2><p>Recent platform profile, staff, report, server-management, and user-moderation actions.</p></div></div>{audit.length ? <div className="audit-list">{audit.map((item) => <div className="audit-row" key={item.id}><div><strong>{item.action_name.replaceAll(".", " · ").replaceAll("_", " ")}</strong><span>{item.actor_name}{item.target_type ? ` · ${item.target_type} ${item.target_id ?? ""}` : ""}</span></div><time>{new Date(item.created_at).toLocaleString()}</time></div>)}</div> : <div className="empty-state">No platform staff actions have been recorded yet.</div>}</section>
    </div>
  );
}
