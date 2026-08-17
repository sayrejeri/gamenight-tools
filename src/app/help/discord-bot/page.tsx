import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const steps = [
  {
    title: "1. Install the optional bot",
    body: "Open your approved server profile, choose Bot settings, and install the Game Night Tools bot into the Discord server linked to that workspace. The website continues working normally if you never install the bot.",
  },
  {
    title: "2. Check the connection",
    body: "Return to Game Night Tools and use Check connection. This confirms the bot can access the expected Discord guild and registers the current /gnt commands for that server.",
  },
  {
    title: "3. Choose only the features you want",
    body: "Discord announcements, temporary private match channels, role synchronization, and member DM reminders all start disabled per server. Enable only the automation your community intends to use.",
  },
  {
    title: "4. Configure Discord targets",
    body: "Copy the announcement channel, match category, competitor role, and champion role IDs from Discord Developer Mode. You may configure only the pieces you intend to use.",
  },
  {
    title: "5. Validate before saving",
    body: "Use Validate Discord configuration. Game Night Tools checks that IDs belong to the connected server, channel/category types are correct, required channel permissions are effective, and synchronized roles are assignable below the bot's highest Discord role.",
  },
  {
    title: "6. Confirm Four Seasons is online",
    body: "Bot settings shows the worker heartbeat separately from the Discord installation. Background reminders, announcements, temporary channel cleanup, and role reconciliation require the Four Seasons worker to be online.",
  },
];

export default function DiscordBotHelpPage() {
  return (
    <main className="public-shell section-stack">
      <header className="public-topbar">
        <BrandMark href="/" />
        <div className="button-row"><Link className="button button-secondary" href="/help">All help</Link><Link className="button" href="/dashboard">Dashboard</Link></div>
      </header>

      <section className="page-heading">
        <div>
          <span className="eyebrow">v1.0 optional integration</span>
          <h1>Discord bot beta</h1>
          <p>Game Night Tools remains a website-first platform. The Discord bot is an optional automation layer for communities that want reminders, commands, announcements, private match channels, and competition-role synchronization.</p>
        </div>
      </section>

      <section className="rule-callout">
        <strong>Member DMs are separate and opt-in.</strong>
        <p>Enabling DM support for a server does not automatically message members. Each Game Night Tools user must turn on Discord bot DMs in their own Profile Settings, and they can separately control event, check-in, match, and result-confirmation reminders.</p>
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Server setup</h2><p>Recommended order for a workspace owner or manager.</p></div></div>
        <div className="review-grid">
          {steps.map((step) => <article className="review-card" key={step.title}><h3>{step.title}</h3><p>{step.body}</p></article>)}
        </div>
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>What each feature does</h2><p>Every automation remains controlled per server.</p></div></div>
        <div className="review-grid">
          <article className="review-card"><span className="card-kicker">DM reminders</span><h3>Personal reminders</h3><p>Opted-in members can receive event, check-in, upcoming match, and result-confirmation reminders. Queued reminders are checked again immediately before delivery, so stale or newly disabled messages are cancelled instead of sent.</p></article>
          <article className="review-card"><span className="card-kicker">Announcements</span><h3>Server updates</h3><p>Post eligible public/server event, match-ready, match-result, and tournament-winner updates into the configured Discord announcement channel.</p></article>
          <article className="review-card"><span className="card-kicker">Match channels</span><h3>Private coordination</h3><p>Create temporary private channels for READY/LIVE tournament matches. Access is limited to the match participants or saved team roster, the primary host, and accepted co-hosts with FULL, BRACKET, or SCOREKEEPER access.</p></article>
          <article className="review-card"><span className="card-kicker">Role sync</span><h3>Competition roles</h3><p>Optionally assign a Competitor role during active competition and a Champion role after a completed tournament. Game Night Tools tracks the exact roles it assigns so stale managed roles can be reconciled safely later.</p></article>
        </div>
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Discord commands</h2><p>Commands are registered after a successful connection check.</p></div></div>
        <div className="compact-list">
          <article className="list-card"><span className="list-icon">/</span><div><strong>/gnt status</strong><span>Connection status and upcoming event count.</span></div></article>
          <article className="list-card"><span className="list-icon">/</span><div><strong>/gnt events</strong><span>Upcoming SERVER/PUBLIC events.</span></div></article>
          <article className="list-card"><span className="list-icon">/</span><div><strong>/gnt matches</strong><span>Active and upcoming tournament matches.</span></div></article>
          <article className="list-card"><span className="list-icon">/</span><div><strong>/gnt bracket</strong><span>Current/latest generated bracket link.</span></div></article>
          <article className="list-card"><span className="list-icon">/</span><div><strong>/gnt leaderboard</strong><span>Public player rankings, with an option for team rankings.</span></div></article>
        </div>
      </section>

      <section className="rule-callout">
        <strong>Discord failures stay isolated from competition state.</strong>
        <p>A failed DM, announcement, private-channel operation, or role operation does not change who won a match, roll back a bracket, or prevent the website from running the event. Workspace managers can review recent jobs and retry failed work after correcting the Discord configuration.</p>
      </section>
    </main>
  );
}
