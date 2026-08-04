import Link from "next/link";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ authError?: string }> }) {
  const session = await readSession();
  const params = await searchParams;

  return (
    <main className="landing-shell">
      <nav className="topbar">
        <Link className="brand" href="/">Game Night Tools</Link>
        {session ? (
          <Link className="button" href="/dashboard">Open dashboard</Link>
        ) : (
          <a className="button" href="/api/auth/discord/login">Continue with Discord</a>
        )}
      </nav>

      <section className="hero">
        <div>
          <span className="eyebrow">gamenights.sayrejeri.com</span>
          <h1>Run organized game nights without forcing every server to install a bot.</h1>
          <p>
            Create server workspaces, approve hosts, share limited-use codes, invite co-hosts,
            collect signups, and prepare brackets from one Discord-authenticated dashboard.
          </p>
          <div className="button-row">
            {session ? (
              <Link className="button button-large" href="/dashboard">Go to your dashboard</Link>
            ) : (
              <a className="button button-large" href="/api/auth/discord/login">Sign in with Discord</a>
            )}
            <a className="button button-secondary button-large" href="#foundation">See what is included</a>
          </div>
          {params.authError ? <p className="error-banner">Discord login failed. Please try again.</p> : null}
        </div>
        <div className="hero-panel">
          <div className="status-line"><span>Discord login</span><strong>Required</strong></div>
          <div className="status-line"><span>Discord bot</span><strong>Optional</strong></div>
          <div className="status-line"><span>Server workspaces</span><strong>Shared</strong></div>
          <div className="status-line"><span>Host access</span><strong>Staff approved</strong></div>
          <div className="status-line"><span>Codes</span><strong>One-time or limited</strong></div>
        </div>
      </section>

      <section id="foundation" className="feature-grid">
        <article className="card">
          <span className="card-kicker">Server workspaces</span>
          <h2>Keep each Discord community separate</h2>
          <p>Owners, staff, approved hosts, events, participant history, and settings belong to one server profile.</p>
        </article>
        <article className="card">
          <span className="card-kicker">Controlled access</span>
          <h2>Choose exactly who can host</h2>
          <p>Staff, host, and event codes can expire, work once, or allow a selected number of redemptions.</p>
        </article>
        <article className="card">
          <span className="card-kicker">Co-hosting</span>
          <h2>Invite help without sharing accounts</h2>
          <p>Co-hosts accept invitations and receive full or limited event permissions. Every change remains attributed.</p>
        </article>
        <article className="card">
          <span className="card-kicker">Discord-aware</span>
          <h2>Show events from connected servers</h2>
          <p>The login checks a user&apos;s server list and displays matching events without requiring a bot installation.</p>
        </article>
        <article className="card">
          <span className="card-kicker">Profiles</span>
          <h2>Import game connections</h2>
          <p>Discord connections can be imported, edited, hidden, or replaced with manually entered game identities.</p>
        </article>
        <article className="card">
          <span className="card-kicker">Tournament foundation</span>
          <h2>Ready for signups and brackets</h2>
          <p>The database foundation includes participants, three-player matches, single elimination, reminders, and audit logs.</p>
        </article>
      </section>
    </main>
  );
}
