import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { canModeratePlatform, getPlatformRole } from "@/lib/platform-access";
import { PlatformUserModeration } from "@/components/platform-user-moderation";

type UserRow = RowDataPacket & {
  id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  site_username: string | null;
  avatar_hash: string | null;
  account_status: string;
  profile_visibility: string;
  onboarding_completed: number;
  created_at: Date;
  last_login_at: Date;
  platform_role: string | null;
  workspace_count: number;
  team_count: number;
};

type CountRow = RowDataPacket & { total: number };

export default async function StaffUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await requireSession();
  const platformRole = await getPlatformRole(session.userId);
  if (!platformRole) notFound();
  const canModerate = canModeratePlatform(platformRole);

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = ["ACTIVE", "SUSPENDED", "BANNED"].includes(params.status ?? "") ? params.status! : "";
  const like = `%${q}%`;

  const [users, totals] = await Promise.all([
    query<UserRow[]>(
      `SELECT CAST(u.id AS CHAR) AS id, u.discord_id, u.username, u.global_name, u.site_username,
              u.avatar_hash, u.account_status, u.profile_visibility, u.onboarding_completed,
              u.created_at, u.last_login_at,
              CASE WHEN psr.status = 'ACTIVE' THEN psr.role ELSE NULL END AS platform_role,
              (SELECT COUNT(*) FROM workspace_members wm WHERE wm.user_id = u.id AND wm.status = 'ACTIVE') AS workspace_count,
              (SELECT COUNT(*) FROM team_members tm WHERE tm.user_id = u.id AND tm.status = 'ACTIVE') AS team_count
       FROM users u
       LEFT JOIN platform_staff_roles psr ON psr.user_id = u.id
       WHERE (? = '' OR u.site_username LIKE ? OR u.username LIKE ? OR u.global_name LIKE ? OR u.discord_id = ?)
         AND (? = '' OR u.account_status = ?)
       ORDER BY u.last_login_at DESC, u.created_at DESC
       LIMIT 200`,
      [q, like, like, like, q, status, status],
    ),
    query<CountRow[]>(`SELECT COUNT(*) AS total FROM users`),
  ]);

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Platform staff</span><h1>Website users</h1><p>View every Discord-authenticated account registered with Game Night Tools. Search by site username, Discord username, display name, or Discord ID.</p></div>
        <Link className="button button-secondary" href="/dashboard/staff">Back to staff dashboard</Link>
      </section>

      <form className="staff-user-search" method="get">
        <input name="q" defaultValue={q} placeholder="Search users or paste a Discord ID" />
        <select name="status" defaultValue={status}>
          <option value="">All account statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </select>
        <button className="button">Search</button>
      </form>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>{q || status ? "Matching users" : "All website users"}</h2><p>Showing {users.length} of {Number(totals[0]?.total ?? 0)} registered accounts.</p></div></div>
        {users.length ? (
          <div className="staff-user-list">
            {users.map((user) => {
              const avatarUrl = user.avatar_hash ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar_hash}.png?size=128` : null;
              return (
                <article className="staff-user-card" key={user.id}>
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="list-icon">{(user.global_name ?? user.username).slice(0, 2)}</span>}
                  <div className="staff-user-main">
                    <div><strong>{user.global_name ?? user.username}</strong>{user.platform_role ? <span className="badge">{user.platform_role}</span> : null}</div>
                    <span>{user.site_username ? `@${user.site_username}` : "No site username"} · Discord: {user.username}</span>
                    <small>Discord ID {user.discord_id}</small>
                  </div>
                  <div className="staff-user-meta">
                    <span className="badge">{user.account_status}</span>
                    <span className="badge">{user.profile_visibility}</span>
                    <span>{user.workspace_count} servers · {user.team_count} teams</span>
                    <small>{user.onboarding_completed ? "Profile setup complete" : "Onboarding incomplete"}</small>
                  </div>
                  <div className="staff-user-actions">
                    <div className="button-row">
                      {user.site_username ? <Link className="button button-secondary" href={`/users/${user.site_username}`}>Open profile</Link> : null}
                      {canModerate ? <PlatformUserModeration userId={user.id} currentStatus={user.account_status} compact /> : null}
                    </div>
                    <span>Last login<br /><strong>{new Date(user.last_login_at).toLocaleString()}</strong></span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state">No website users matched those filters.</div>}
      </section>
    </div>
  );
}
