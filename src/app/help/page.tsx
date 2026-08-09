import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PublicFooter } from "@/components/public-footer";

export const metadata = { title: "Help & Walkthrough" };

const sections = [
  ["Getting started", "Sign in with Discord, finish your site profile, choose a site username, and review your privacy settings."],
  ["Game identities", "Open Game identities to import Discord-connected accounts or add usernames manually. Keep an identity visible if an event needs to verify the account you will play on."],
  ["Refresh Discord", "Use Refresh from Discord on the Game identities page whenever your Discord username, avatar, server memberships, or Discord-connected accounts change."],
  ["Finding communities", "Approved server profiles appear automatically when the Discord servers you authorized match registered Game Night Tools communities."],
  ["Community chat", "Open Community from the dashboard to see server and team chats you can access. Normal channels support replies, reactions, pins, mentions, unread counts, and message reports. Announcement and staff-only channels follow the permissions set by that community."],
  ["Joining an event", "Open the event, review its game and times, link the required game identity, redeem a join code if one is required, then select Sign up for event."],
  ["Checking in", "When the host opens check-in, return to the event and press Check in now. Hosts may use check-in status when generating tournament brackets."],
  ["Hosting an event", "Authorized hosts can create drafts, choose the game and platform, set visibility, signup and check-in windows, participant limits, join-code rules, bracket settings, and Discord announcement options."],
  ["Co-hosts", "Event managers can search existing Game Night Tools users by site or Discord username, or use a numeric Discord ID for someone who has not signed in yet. The invited person must accept before access becomes active."],
  ["Access Center", "Open Access Center from your account menu to see why you have platform, server, or event access, which permissions are active, whether access is temporary, and when it expires."],
  ["Staff roles and permissions", "A visible title such as Host or Moderator is separate from permissions. Owners can use role presets, customize individual capabilities, suspend access, set expirations, copy permissions, and protect high-risk Admin or Owner actions. Chat permissions separately control channels, messages, staff channels, announcements, and timeouts."],
  ["Discord webhooks", "Server staff with webhook permission can connect multiple Discord webhooks. Each destination can have its own label, sender, avatar, notification types, enabled state, test action, and encrypted webhook URL. Website announcement channels can optionally forward announcements through selected webhooks."],
  ["Teams", "Team profiles can manage rosters, recruiting, applications, invitations, affiliations with approved server profiles, a main game, and private team chat when enabled. Roblox profiles can use a game name, Place ID, or game URL where supported."],
  ["Tools", "The Tools hub includes bracket management, random teams, quick matchups, map picking, Discord announcement formatting, timestamps, and countdown utilities."],
  ["Notifications", "Notifications show invitations, role changes, moderation updates, event activity, chat mentions/replies, and other account-specific information. Read notifications can be deleted individually or cleared together."],
  ["Audit logs", "Authorized staff can review administrative history with filters for server, staff member, action, severity, and target. Full-audit access is required for sensitive security and permission details."],
  ["Reports and moderation", "Profiles and chat messages can be reported. Authorized staff can review reports, remove community messages, pin important posts, or apply temporary chat timeouts only when their assigned permissions allow it."],
] as const;

export default function HelpPage() {
  return (
    <main className="landing-shell legal-shell help-shell">
      <nav className="topbar">
        <BrandMark href="/" />
        <div className="button-row"><Link className="button button-secondary" href="/">Home</Link><Link className="button" href="/dashboard">Open dashboard</Link></div>
      </nav>

      <section className="page-heading legal-heading"><div><span className="eyebrow">New here?</span><h1>Game Night Tools walkthrough</h1><p>Use this as a quick reference for players, hosts, team staff, and community administrators.</p></div></section>

      <section className="help-quick-grid">
        <a className="card" href="#players"><span className="card-kicker">Players</span><h2>Join and communicate</h2><p>Link your game account, join community chat, sign up, check in, and follow event results.</p></a>
        <a className="card" href="#hosts"><span className="card-kicker">Hosts</span><h2>Run events</h2><p>Create events, invite co-hosts, manage participants, and operate brackets.</p></a>
        <a className="card" href="#communities"><span className="card-kicker">Communities</span><h2>Manage servers and teams</h2><p>Build profiles, channels, permissions, webhooks, rosters, audit trails, and moderation workflows.</p></a>
      </section>

      <section className="panel legal-copy section-stack" id="players">
        <div><span className="eyebrow">Walkthrough</span><h2>Feature guide</h2><p className="muted">You do not need to memorize the site. These steps explain what each major area is for.</p></div>
        {sections.map(([title, description], index) => (
          <article className="help-step" id={index === 7 ? "hosts" : index === 9 ? "communities" : undefined} key={title}>
            <span className="help-step-number">{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div>
          </article>
        ))}
      </section>

      <section className="panel section-stack">
        <h2>Good places to start</h2>
        <div className="button-row"><Link className="button" href="/dashboard/community">Community</Link><Link className="button button-secondary" href="/dashboard/profile">Game identities</Link><Link className="button button-secondary" href="/dashboard/events">Events</Link><Link className="button button-secondary" href="/dashboard/servers">Servers</Link><Link className="button button-secondary" href="/dashboard/access">Access Center</Link><Link className="button button-secondary" href="/dashboard/tools">Tools</Link></div>
      </section>
      <PublicFooter />
    </main>
  );
}
