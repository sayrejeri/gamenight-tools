import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformRole } from "@/lib/platform-access";
import { PlatformTeamProfileForm } from "@/components/platform-team-profile-form";

type TeamRow = RowDataPacket & {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  main_platform: string | null;
  main_game: string | null;
  region: string | null;
  recruiting_status: "OPEN" | "INVITE_ONLY" | "CLOSED";
  profile_status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "DENIED" | "SUSPENDED" | "ARCHIVED";
  verification_level: "APPROVED" | "OWNERSHIP_VERIFIED" | "OFFICIAL" | "PARTNER" | null;
  chat_enabled: number;
  suggestions_enabled: number;
  owner_user_id: string;
  owner_name: string;
  member_count: number;
  pending_applications: number;
  created_at: Date;
  updated_at: Date;
};

export default async function StaffTeamProfilePage({ params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireSession();
  const role = await getPlatformRole(session.userId);
  if (role !== "OWNER" && role !== "ADMIN") notFound();

  const { teamId } = await params;
  const teams = await query<TeamRow[]>(
    `SELECT t.id, t.slug, t.name, t.tag, t.description, t.logo_url, t.banner_url, t.main_platform, t.main_game,
            t.region, t.recruiting_status, t.profile_status, t.verification_level, t.chat_enabled, t.suggestions_enabled,
            CAST(t.owner_user_id AS CHAR) AS owner_user_id, COALESCE(u.site_username, u.global_name, u.username) AS owner_name,
            t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id AND tm.status = 'ACTIVE') AS member_count,
            (SELECT COUNT(*) FROM team_applications ta WHERE ta.team_id = t.id AND ta.status = 'PENDING') AS pending_applications
     FROM teams t INNER JOIN users u ON u.id = t.owner_user_id
     WHERE t.id = ? LIMIT 1`,
    [teamId],
  );
  const team = teams[0];
  if (!team) notFound();

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Platform team administration</span><h1>{team.name}</h1><p>Edit the team directly as platform staff. Changes here do not require joining the roster.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/staff/teams">All teams</Link>{team.profile_status === "APPROVED" ? <Link className="button button-secondary" href={`/teams/${team.slug}`}>Public profile</Link> : null}<Link className="button button-secondary" href="/dashboard/team-server-identity">Team &amp; server identity</Link></div>
      </section>

      <div className="staff-stat-grid">
        <article className="stat-card"><strong>{team.member_count}</strong><span>Active members</span></article>
        <article className="stat-card"><strong>{team.pending_applications}</strong><span>Pending applications</span></article>
        <article className="stat-card"><strong>{team.profile_status.replaceAll("_", " ")}</strong><span>Profile status</span></article>
        <article className="stat-card"><strong>{team.verification_level?.replaceAll("_", " ") ?? "NONE"}</strong><span>Verification</span></article>
      </div>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Administrative context</h2><p>Use this information to confirm you are changing the correct team.</p></div></div>
        <div className="review-grid">
          <article className="review-card"><span className="card-kicker">Owner</span><h3>{team.owner_name}</h3><p>User ID {team.owner_user_id}</p></article>
          <article className="review-card"><span className="card-kicker">Public route</span><h3>/{team.slug}</h3><p>Created {new Date(team.created_at).toLocaleString()} · Updated {new Date(team.updated_at).toLocaleString()}</p></article>
        </div>
      </section>

      <PlatformTeamProfileForm teamId={team.id} initial={{
        name: team.name,
        tag: team.tag ?? "",
        description: team.description ?? "",
        logoUrl: team.logo_url ?? "",
        bannerUrl: team.banner_url ?? "",
        mainPlatform: team.main_platform ?? "",
        mainGame: team.main_game ?? "",
        region: team.region ?? "",
        recruitingStatus: team.recruiting_status,
        profileStatus: team.profile_status,
        verificationLevel: team.verification_level ?? "",
        chatEnabled: Boolean(team.chat_enabled),
        suggestionsEnabled: Boolean(team.suggestions_enabled),
      }} />

      <section className="rule-callout"><strong>v1.0 administration foundation</strong><p>This first slice covers full team profile fields, status, verification, recruiting, and community toggles. Roster ownership, team/server affiliations, protected private-server links, and destructive actions remain on their existing guarded workflows while we extend the v1.0 staff controls.</p></section>
    </div>
  );
}
