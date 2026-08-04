import Link from "next/link";
import { getDiscordAvatarUrl, requireSession } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const avatarUrl = getDiscordAvatarUrl(session.discordId, session.avatarHash);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="user-summary" href="/dashboard">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar" src={avatarUrl} alt="Discord avatar" />
          ) : (
            <span className="avatar avatar-fallback">{(session.globalName ?? session.username).slice(0, 1).toUpperCase()}</span>
          )}
          <span>
            <strong>{session.globalName ?? session.username}</strong><br />
            <small className="muted">Game Night Tools</small>
          </span>
        </Link>
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/dashboard/tools/bracket">Bracket tool</Link>
          <Link href="/dashboard/profile">Game identities</Link>
          <Link href="/">Public home</Link>
          <SignOutButton />
        </nav>
      </header>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
