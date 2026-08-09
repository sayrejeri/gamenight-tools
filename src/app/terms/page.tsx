import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PublicFooter } from "@/components/public-footer";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="landing-shell legal-shell">
      <nav className="topbar">
        <BrandMark href="/" />
        <Link className="button button-secondary" href="/">Back home</Link>
      </nav>

      <section className="page-heading legal-heading">
        <div>
          <span className="eyebrow">Site terms</span>
          <h1>Terms of Service</h1>
          <p>Plain-language rules for using Game Night Tools. Effective August 9, 2026.</p>
        </div>
      </section>

      <section className="panel legal-copy section-stack">
        <div><h2>1. What Game Night Tools is</h2><p>Game Night Tools is a Discord-connected community platform for events, signups, teams, server profiles, community communication, brackets, suggestions, moderation, and host utilities. It is a companion to community platforms such as Discord and is not operated by Discord, Roblox, Valve, Microsoft, Epic Games, Twitch, GitHub, or other connected services.</p></div>
        <div><h2>2. Your account</h2><p>You sign in with Discord instead of creating a separate password. You are responsible for keeping your Discord account secure and for activity performed through your Game Night Tools account. You must also follow the rules and age requirements of Discord and any connected game or service you use.</p></div>
        <div><h2>3. Profiles, messages, and community content</h2><p>You may submit profile information, game identities, server or team requests, event content, chat messages, replies, reactions, suggestions, comments, applications, and similar community content. Do not submit content that is illegal, malicious, deceptive, harassing, sexually explicit, hateful, infringing, spam, or intended to expose another person's private information. Do not use chat to share passwords, payment-card information, authentication tokens, or other sensitive secrets.</p></div>
        <div><h2>4. Community chat rules</h2><p>Server and team owners may enable website chat, create normal, announcement, or staff-only channels, and set community-specific rules. Access to a Discord-backed server chat may depend on your authorized Discord membership or assigned website role. Team chat requires an active team membership. Staff-only channels do not make their content public, but reported content may be reviewed by authorized platform staff for moderation and safety.</p></div>
        <div><h2>5. Events, teams, and staff access</h2><p>Community owners and authorized staff may create events, manage participants, assign roles, create channels, post announcements, moderate messages, apply temporary chat timeouts, and administer their server or team areas. Access granted by a community does not make that person an owner of the Game Night Tools platform. Platform staff may intervene when needed for safety, abuse prevention, site integrity, or policy enforcement.</p></div>
        <div><h2>6. Moderation</h2><p>Content, messages, profiles, accounts, teams, servers, or access may be restricted, hidden, timed out, suspended, or removed when reasonably necessary to enforce site or community rules, protect users, investigate reports, prevent abuse, or maintain the service. Serious or repeated abuse may result in permanent loss of access.</p></div>
        <div><h2>7. Event results and disputes</h2><p>Game Night Tools provides organization and recordkeeping features, but community hosts remain responsible for their event rules, participant decisions, scoring, and disputes unless a specific platform-run event says otherwise.</p></div>
        <div><h2>8. Third-party services and webhooks</h2><p>Features may rely on Discord OAuth, Discord webhooks, public game-platform information, or links to third-party services. Community owners may configure selected website announcements to be forwarded to their own Discord webhook destinations. Their own terms and privacy practices also apply. Game Night Tools is not responsible for outages, policy changes, or content controlled by those third parties.</p></div>
        <div><h2>9. Availability and beta features</h2><p>The site is actively developed. Features may change, break, move, or be removed, and temporary downtime may occur. We try to protect stored data and keep the service reliable, but uninterrupted availability is not guaranteed.</p></div>
        <div><h2>10. Paid features</h2><p>Game Night Tools does not currently process purchases through the website. Optional paid customization or subscriptions may be added later. If billing launches, pricing, refund rules, billing terms, and the Privacy Policy will be updated before those features are made available.</p></div>
        <div><h2>11. Changes to these terms</h2><p>These terms may be updated as the platform changes. A newer effective date will be shown when material changes are published. Continued use after an update means you agree to the revised terms.</p></div>
      </section>

      <PublicFooter />
    </main>
  );
}
