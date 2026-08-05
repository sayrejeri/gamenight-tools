import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { BrandMark } from "@/components/brand-mark";
import { TeamApplicationForm } from "@/components/team-application-form";
import { TeamSettingsForm } from "@/components/team-settings-form";
import { TeamApplicationReview } from "@/components/team-application-review";
import { TeamInviteForm } from "@/components/team-invite-form";

type TeamRow = RowDataPacket & { id: string; name: string; slug: string; tag: string | null; description: string | null; logo_url: string | null; banner_url: string | null; main_platform: string | null; main_game: string | null; region: string | null; recruiting_status: "OPEN" | "INVITE_ONLY" | "CLOSED"; profile_status: string; verification_level: string | null; chat_enabled: number; suggestions_enabled: number; home_workspace_id: string | null; home_workspace_name: string | null };
type MemberRow = RowDataPacket & { user_id: string; role: string; site_username: string | null; display_name: string; discord_id: string; avatar_hash: string | null; roblox_avatar: string | null };
type ApplicationRow = RowDataPacket & { id: string; desired_role: string; message: string | null; applicant_name: string; site_username: string | null; created_at: Date };

export const dynamic = "force-dynamic";

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const viewer = await readSession();
  const { slug } = await params;
  const rows = await query<TeamRow[]>(
    `SELECT t.id, t.name, t.slug, t.tag, t.description, t.logo_url, t.banner_url,
            t.main_platform, t.main_game, t.region, t.recruiting_status, t.profile_status,
            t.verification_level, t.chat_enabled, t.suggestions_enabled, t.home_workspace_id,
            w.name AS home_workspace_name
     FROM teams t LEFT JOIN workspaces w ON w.id = t.home_workspace_id
     WHERE LOWER(t.slug) = LOWER(?) LIMIT 1`,
    [slug],
  );
  const team = rows[0];
  if (!team || team.profile_status !== "APPROVED") notFound();

  const membership = viewer ? await query<(RowDataPacket & { role: string; status: string })[]>(
    `SELECT role, status FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1`, [team.id, viewer.userId]) : [];
  const viewerMembership = membership[0];
  const canManage = viewerMembership?.status === "ACTIVE" && ["OWNER", "MANAGER"].includes(viewerMembership.role);
  const hasPendingApplication = viewer ? Boolean((await query<RowDataPacket[]>(
    `SELECT id FROM team_applications WHERE team_id = ? AND applicant_user_id = ? AND status = 'PENDING' LIMIT 1`, [team.id, viewer.userId]))[0]) : false;

  const [members, applications] = await Promise.all([
    query<MemberRow[]>(
      `SELECT tm.user_id, tm.role, u.site_username,
              COALESCE(u.global_name, u.username) AS display_name, u.discord_id, u.avatar_hash,
              (SELECT uc.avatar_url FROM user_connections uc WHERE uc.user_id = u.id AND LOWER(uc.connection_type) = 'roblox' AND uc.is_visible = 1 ORDER BY uc.is_verified DESC LIMIT 1) AS roblox_avatar
       FROM team_members tm INNER JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ? AND tm.status = 'ACTIVE'
       ORDER BY FIELD(tm.role, 'OWNER', 'MANAGER', 'CAPTAIN', 'PLAYER', 'SUBSTITUTE', 'COACH'), display_name`,
      [team.id],
    ),
    canManage ? query<ApplicationRow[]>(
      `SELECT ta.id, ta.desired_role, ta.message, ta.created_at, u.site_username,
              COALESCE(u.global_name, u.username) AS applicant_name
       FROM team_applications ta INNER JOIN users u ON u.id = ta.applicant_user_id
       WHERE ta.team_id = ? AND ta.status = 'PENDING' ORDER BY ta.created_at ASC`,
      [team.id],
    ) : Promise.resolve([] as ApplicationRow[]),
  ]);

  return (
    <main className="public-shell section-stack">
      <header className="public-topbar"><BrandMark href="/" /><div className="button-row">{viewer ? <Link className="button button-secondary" href="/dashboard/teams">Teams dashboard</Link> : <a className="button" href="/api/auth/discord/login">Sign in</a>}</div></header>
      <section className="organization-hero" style={team.banner_url ? { backgroundImage: `linear-gradient(90deg, rgba(9,11,18,.94), rgba(9,11,18,.50)), url(${team.banner_url})` } : undefined}>
        <div className="organization-hero-main">{team.logo_url ? <img className="organization-hero-logo" src={team.logo_url} alt="" /> : <span className="organization-hero-logo organization-logo-fallback">{team.tag?.slice(0, 3) ?? team.name.slice(0, 2)}</span>}<div><span className="eyebrow">{team.tag ? `[${team.tag}] ` : ""}Competitive team</span><h1>{team.name}</h1><p>{team.description ?? "This team has not added a description yet."}</p><div className="button-row">{team.verification_level ? <span className="badge">✓ {team.verification_level.replaceAll("_", " ")}</span> : null}<span className="badge">Recruiting: {team.recruiting_status.replaceAll("_", " ")}</span>{team.region ? <span className="badge">{team.region}</span> : null}{team.main_platform ? <span className="badge">{team.main_platform}</span> : null}{team.main_game ? <span className="badge">{team.main_game}</span> : null}</div></div></div>
        {team.home_workspace_id ? <Link className="button button-secondary" href={`/dashboard/workspaces/${team.home_workspace_id}`}>Home server: {team.home_workspace_name}</Link> : null}
      </section>

      <div className="dashboard-grid">
        <section className="panel section-stack"><div className="section-header"><div><h2>Roster</h2><p>{members.length} active members.</p></div></div><div className="roster-grid">{members.map((member) => { const avatar = member.roblox_avatar || (member.avatar_hash ? `https://cdn.discordapp.com/avatars/${member.discord_id}/${member.avatar_hash}.png?size=128` : null); const card = <article className="roster-card">{avatar ? <img src={avatar} alt="" /> : <span className="roster-avatar avatar-fallback">{member.display_name.slice(0, 1)}</span>}<div><strong>{member.display_name}</strong><span>{member.role.toLowerCase()}</span></div></article>; return member.site_username ? <Link href={`/users/${member.site_username}`} key={member.user_id}>{card}</Link> : <div key={member.user_id}>{card}</div>; })}</div></section>
        <aside className="section-stack">{viewer && !viewerMembership && team.recruiting_status === "OPEN" ? <TeamApplicationForm teamId={team.id} hasPending={hasPendingApplication} /> : null}{viewerMembership ? <section className="card"><span className="card-kicker">Your team role</span><h3>{viewerMembership.role}</h3><p className="muted">Status: {viewerMembership.status.toLowerCase()}</p>{viewerMembership.status === "INVITED" ? <Link className="button" href="/dashboard/teams">Respond to invitation</Link> : null}</section> : null}<section className="card"><span className="card-kicker">Community features</span><h3>{team.chat_enabled ? "Team chat enabled" : "Team chat planned"}</h3><p className="muted">Team suggestions are {team.suggestions_enabled ? "enabled" : "disabled"}. Full chat arrives in the communication update.</p></section></aside>
      </div>

      {canManage ? <>
        <TeamSettingsForm teamId={team.id} initial={{ description: team.description ?? "", logoUrl: team.logo_url ?? "", bannerUrl: team.banner_url ?? "", mainPlatform: team.main_platform ?? "", mainGame: team.main_game ?? "", region: team.region ?? "", recruitingStatus: team.recruiting_status, chatEnabled: Boolean(team.chat_enabled), suggestionsEnabled: Boolean(team.suggestions_enabled) }} />
        <section className="panel section-stack"><div className="section-header"><div><h2>Invite roster members</h2><p>Invite any user who has signed into Game Night Tools. They must accept before appearing as an active roster member.</p></div></div><TeamInviteForm teamId={team.id} /></section>
        <section className="panel section-stack"><div className="section-header"><div><h2>Recruitment applications</h2><p>Accept applicants into a roster role or deny the request.</p></div></div>{applications.length ? <div className="review-grid">{applications.map((application) => <article className="review-card" key={application.id}><span className="card-kicker">{application.desired_role}</span><h3>{application.applicant_name}</h3><p>{application.message ?? "No message provided."}</p>{application.site_username ? <Link className="text-link" href={`/users/${application.site_username}`}>Open profile</Link> : null}<TeamApplicationReview teamId={team.id} applicationId={application.id} desiredRole={application.desired_role} /></article>)}</div> : <div className="empty-state">No pending applications.</div>}</section>
      </> : null}
    </main>
  );
}
