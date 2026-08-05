import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformRole } from "@/lib/platform-access";
import { SignOutButton } from "@/components/sign-out-button";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

type HeaderUserRow = RowDataPacket & { site_username: string | null; onboarding_completed: number };
type NotificationCountRow = RowDataPacket & { unread: number };

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const avatarUrl = getDiscordAvatarUrl(session.discordId, session.avatarHash);
  const [userRows, notificationRows, platformRole] = await Promise.all([
    query<HeaderUserRow[]>(`SELECT site_username, onboarding_completed FROM users WHERE id = ? LIMIT 1`, [session.userId]),
    query<NotificationCountRow[]>(`SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0`, [session.userId]),
    getPlatformRole(session.userId),
  ]);
  const siteUsername = userRows[0]?.site_username;
  const unread = Number(notificationRows[0]?.unread ?? 0);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header dashboard-header-v3">
        <BrandMark />
        <nav className="dashboard-nav dashboard-nav-primary" aria-label="Dashboard navigation">
          <Link href="/dashboard">Home</Link>
          <Link href="/dashboard/events">Events</Link>
          <Link href="/dashboard/servers">Servers</Link>
          <Link href="/dashboard/teams">Teams</Link>
          <Link href="/dashboard/suggestions">Suggestions</Link>
          <Link href="/dashboard/tools">Tools</Link>
          <Link href="/dashboard/search">Search</Link>
        </nav>
        <div className="header-account-actions">
          <Link className="notification-link" href="/dashboard/notifications" aria-label={`${unread} unread notifications`}>🔔{unread ? <span>{unread > 99 ? "99+" : unread}</span> : null}</Link>
          <details className="profile-menu">
            <summary>
              {avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <span className="avatar avatar-fallback">{(session.globalName ?? session.username).slice(0, 1).toUpperCase()}</span>}
              <span><strong>{session.globalName ?? session.username}</strong><small>@{siteUsername ?? session.username}</small></span>
            </summary>
            <div className="profile-menu-popover">
              {siteUsername ? <Link href={`/users/${siteUsername}`}>My profile</Link> : null}
              <Link href="/dashboard/profile">Game identities</Link>
              <Link href="/dashboard/settings">Settings</Link>
              <Link href="/dashboard/profile-requests">Profile requests</Link>
              {platformRole ? <Link href="/dashboard/staff">Staff dashboard <span className="badge">{platformRole}</span></Link> : null}
              <SignOutButton />
            </div>
          </details>
        </div>
      </header>
      {!userRows[0]?.onboarding_completed ? <div className="onboarding-banner"><span>Finish your profile to choose a site username, timezone, and privacy settings.</span><Link className="button" href="/dashboard/onboarding">Finish setup</Link></div> : null}
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
