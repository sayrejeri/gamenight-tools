import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PublicFooter } from "@/components/public-footer";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="landing-shell legal-shell">
      <nav className="topbar">
        <BrandMark href="/" />
        <Link className="button button-secondary" href="/">Back home</Link>
      </nav>

      <section className="page-heading legal-heading">
        <div>
          <span className="eyebrow">Your data</span>
          <h1>Privacy Policy</h1>
          <p>A plain-language explanation of the information Game Night Tools currently uses. Effective August 7, 2026.</p>
        </div>
      </section>

      <section className="panel legal-copy section-stack">
        <div><h2>1. Information received from Discord</h2><p>When you authorize Discord, Game Night Tools receives information Discord makes available through the permissions you approve. This currently includes your Discord user ID, username, display name, avatar, authorized server memberships and server permission information, and connected accounts returned by Discord.</p></div>
        <div><h2>2. Information you add to Game Night Tools</h2><p>The site may store your site username, timezone, privacy choices, public profile information, manually added game identities, server or team requests, team memberships, applications, event signups and check-ins, suggestions, comments, votes, reports, moderation records, and other information you choose to submit through platform features.</p></div>
        <div><h2>3. Community and staff records</h2><p>When you manage a community or event, Game Night Tools may store roles, permissions, approvals, event changes, bracket activity, moderation actions, audit records, co-host invitations, webhook configuration metadata, and similar records needed to operate and secure the platform.</p></div>
        <div><h2>4. Login and connection refresh</h2><p>Game Night Tools uses Discord OAuth to sign you in and refresh your Discord-provided information. The Discord access token used during that authorization is used to retrieve the approved information and is not intentionally stored in the application database after the sync finishes. The site uses secure session and temporary OAuth cookies to keep you signed in and complete authorization.</p></div>
        <div><h2>5. Public information</h2><p>Information you mark as visible may appear on public user, server, team, event, suggestion, participant, or other community pages. Some information is visible only to authorized community staff or platform staff depending on the feature and your privacy settings.</p></div>
        <div><h2>6. How information is used</h2><p>Information is used to authenticate accounts, discover approved communities you belong to, connect game identities, operate events and teams, send site notifications, enforce permissions, investigate reports, maintain audit trails, prevent abuse, and improve site features.</p></div>
        <div><h2>7. Third parties</h2><p>Game Night Tools relies on third-party services where needed, including Discord for authentication and connection data and public platform services such as Roblox when resolving supported public game identities. Links, webhooks, or embedded features may also interact with services chosen by a community administrator. Those services have their own privacy practices.</p></div>
        <div><h2>8. Payments</h2><p>The website does not currently process payment card information. If Stripe or another payment provider is enabled later, this policy will be updated before public billing launches. Payment card information would be handled by the payment provider rather than stored directly by Game Night Tools.</p></div>
        <div><h2>9. Data sharing</h2><p>Game Night Tools does not sell user data to advertisers. Information is shared when you intentionally make it public, when it is necessary to provide a feature you requested, with authorized staff who need it to administer the platform or a community, or when required for security or legal reasons.</p></div>
        <div><h2>10. Retention and deletion</h2><p>Account and community records are kept while they are needed to operate the service, preserve event or moderation history, prevent abuse, or meet legitimate administrative needs. You can remove manual game identities and change profile visibility from your account. For requests that cannot currently be completed through self-service tools, contact platform staff.</p></div>
        <div><h2>11. Security</h2><p>Game Night Tools uses authentication, permission checks, protected sessions, and other technical measures intended to reduce unauthorized access. No internet service can guarantee absolute security, so users should also protect their Discord accounts and avoid sharing sensitive information through public profile fields.</p></div>
        <div><h2>12. Policy changes</h2><p>This page will be updated as new data-using features are introduced. Material changes will receive a new effective date.</p></div>
      </section>

      <PublicFooter />
    </main>
  );
}
