import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformRole } from "@/lib/platform-access";
import { BrandMark } from "@/components/brand-mark";
import { DashboardHeaderActions } from "@/components/dashboard-header-actions";

export const dynamic = "force-dynamic";

type HeaderUserRow = RowDataPacket & { site_username: string | null; onboarding_completed: number };
type NotificationCountRow = RowDataPacket & { unread: number };

const primaryLinks = [
  ["Home", "/dashboard"], ["Events", "/dashboard/events"], ["Servers", "/dashboard/servers"],
  ["Teams", "/dashboard/teams"], ["Leaderboards", "/dashboard/leaderboards"], ["Community", "/dashboard/community"],
  ["Suggestions", "/dashboard/suggestions"], ["Tools", "/dashboard/tools"], ["Search", "/dashboard/search"],
] as const;

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const avatarUrl = getDiscordAvatarUrl(session.discordId, session.avatarHash);
  const [userRows, notificationRows, platformRole] = await Promise.all([
    query<HeaderUserRow[]>(`SELECT site_username, onboarding_completed FROM users WHERE id = ? LIMIT 1`, [session.userId]),
    query<NotificationCountRow[]>(`SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0 AND dismissed_at IS NULL`, [session.userId]),
    getPlatformRole(session.userId),
  ]);
  const siteUsername = userRows[0]?.site_username ?? null;
  const unread = Number(notificationRows[0]?.unread ?? 0);
  const displayName = session.globalName ?? session.username;

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header dashboard-header-v3">
        <BrandMark />
        <nav className="dashboard-nav dashboard-nav-primary" aria-label="Dashboard navigation">
          {primaryLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <DashboardHeaderActions avatarUrl={avatarUrl} displayName={displayName} siteUsername={siteUsername} fallbackUsername={session.username} unread={unread} platformRole={platformRole} />
      </header>
      {!userRows[0]?.onboarding_completed ? <div className="onboarding-banner"><span>Finish your profile to choose a site username, timezone, and privacy settings.</span><Link className="button" href="/dashboard/onboarding">Finish setup</Link></div> : null}
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
