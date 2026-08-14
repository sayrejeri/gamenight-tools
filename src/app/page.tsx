import Link from "next/link";
import { readSession } from "@/lib/auth";
import { BrandMark } from "@/components/brand-mark";
import { PublicFooter } from "@/components/public-footer";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ authError?: string }> }) {
  const session = await readSession();
  const params = await searchParams;

  return (
    <main className="landing-shell">
      <nav className="topbar">
        <BrandMark href="/" />
        <div className="button-row">
          <Link className="button button-secondary" href="/help">How it works</Link>
          {session ? <Link className="button" href="/dashboard">Open dashboard</Link> : <a className="button" href="/api/auth/discord/login">Continue with Discord</a>}
        </div>
      </nav>

      <section className="hero">
        <div>
          <span className="eyebrow">Events · Teams · Communities</span>
          <h1>Everything your game-night community needs, without requiring a Discord bot.</h1>
          <p>
            Create server and team profiles, publish events, collect signups, manage participants,
            build brackets, connect Discord webhooks, share suggestions, and keep every action tied to a Discord-authenticated user.
          </p>
          <div className="button-row">
            {session ? <Link className="button button-large" href="/dashboard">Go to your dashboard</Link> : <a className="button button-large" href="/api/auth/discord/login">Sign in with Discord</a>}
            <a className="button button-secondary button-large" href="#foundation">Explore the platform</a>
          </div>
          {!session ? <p className="legal-consent-note">By continuing with Discord, you agree to the <Link href="/terms">Terms of Service</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p> : null}
          {params.authError ? <p className="error-banner">Discord login failed. Please try again.</p> : null}
        </div>
        <div className="hero-panel">
          <div className="status-line"><span>Discord login</span><strong>Required</strong></div>
          <div className="status-line"><span>Discord bot</span><strong>Not required</strong></div>
          <div className="status-line"><span>Discord webhooks</span><strong>Supported</strong></div>
          <div className="status-line"><span>User profiles</span><strong>Discord connected</strong></div>
          <div className="status-line"><span>Server and team profiles</span><strong>Approval workflows</strong></div>
          <div className="status-line"><span>Event times</span><strong>Viewer local</strong></div>
        </div>
      </section>

      <section id="foundation" className="feature-grid">
        <article className="card"><span className="card-kicker">Events</span><h2>From draft to final result</h2><p>Publish signups, manage waitlists and check-in, require game identities, prepare brackets, and display times correctly for every viewer.</p></article>
        <article className="card"><span className="card-kicker">Community profiles</span><h2>Give every server a real home</h2><p>Server profiles support full-card banners, logos, Discord invites, Roblox communities, saved games, staff roles, and events.</p></article>
        <article className="card"><span className="card-kicker">Teams</span><h2>Build competitive rosters</h2><p>Team profiles include owners, managers, captains, players, substitutes, recruiting settings, applications, and linked player profiles.</p></article>
        <article className="card"><span className="card-kicker">Discord integration</span><h2>Post updates without installing a bot</h2><p>Owners can connect encrypted Discord webhooks for event, bracket, check-in, and result announcements. A bot remains optional for future advanced features.</p></article>
        <article className="card"><span className="card-kicker">Suggestions</span><h2>Let the community shape updates</h2><p>Members can submit ideas, upvote or downvote, comment, and follow each suggestion from review to planned, development, and release.</p></article>
        <article className="card"><span className="card-kicker">Tools</span><h2>Keep useful host utilities together</h2><p>Build brackets, random teams, quick matchups, map picks, Discord announcements, and local-time countdowns from one tools hub.</p></article>
      </section>

      <PublicFooter />
    </main>
  );
}
