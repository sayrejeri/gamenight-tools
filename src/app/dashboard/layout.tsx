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

const primaryLinks = [
  ["Home", "/dashboard"],
  ["Events", "/dashboard/events"],
  ["Servers", "/dashboard/servers"],
  ["Teams", "/dashboard/teams"],
  ["Suggestions", "/dashboard/suggestions"],
  ["Tools", "/dashboard/tools"],
  ["Search", "/dashboard/search"],
] as const;

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
  const displayName = session.globalName ?? session.username;

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header dashboard-header-v3">
        <BrandMark />

        <nav className="dashboard-nav dashboard-nav-primary" aria-label="Dashboard navigation">
          {primaryLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>

        <div className="header-account-actions">
          <Link className="notification-link" href="/dashboard/notifications" aria-label={`${unread} unread notifications`}>
            <span className="notification-symbol" aria-hidden="true">🔔</span>
            {unread ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
          </Link>

          <details className="profile-menu">
            <summary aria-label="Open profile menu">
              {avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <span className="avatar avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}
              <span><strong>{displayName}</strong><small>@{siteUsername ?? session.username}</small></span>
            </summary>
            <div className="profile-menu-popover">
              <div className="profile-menu-user">
                {avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <span className="avatar avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}
                <div><strong>{displayName}</strong><small>@{siteUsername ?? session.username}</small></div>
              </div>
              {siteUsername ? <Link href={`/users/${siteUsername}`}>My profile</Link> : null}
              <Link href="/dashboard/profile">Game identities</Link>
              <Link href="/dashboard/settings">Settings</Link>
              <Link href="/dashboard/profile-requests">Profile requests</Link>
              {platformRole ? <Link href="/dashboard/staff">Staff dashboard <span className="badge">{platformRole}</span></Link> : null}
              <SignOutButton />
            </div>
          </details>

          <details className="mobile-navigation">
            <summary aria-label="Open navigation menu">
              <span className="hamburger-lines" aria-hidden="true"><i /><i /><i /></span>
            </summary>
            <div className="mobile-navigation-panel">
              <div className="mobile-navigation-heading"><strong>Navigate</strong><small>Game Night Tools</small></div>
              <nav aria-label="Mobile dashboard navigation">
                {primaryLinks.map(([label, href]) => <Link href={href} key={href}>{label}<span aria-hidden="true">›</span></Link>)}
              </nav>
            </div>
          </details>
        </div>
      </header>

      {!userRows[0]?.onboarding_completed ? <div className="onboarding-banner"><span>Finish your profile to choose a site username, timezone, and privacy settings.</span><Link className="button" href="/dashboard/onboarding">Finish setup</Link></div> : null}
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
