import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { TeamInvitationControls } from "@/components/team-invitation-controls";

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
  recruiting_status: string;
  verification_level: string | null;
  member_role: string | null;
  member_status: string | null;
  member_count: number;
};

function TeamCard({ team }: { team: TeamRow }) {
  return <Link className="organization-card" href={`/teams/${team.slug}`} style={team.banner_url ? { backgroundImage: `linear-gradient(180deg, rgba(17,21,34,.30), rgba(17,21,34,.98)), url(${team.banner_url})` } : undefined}><div className="organization-card-top">{team.logo_url ? <img src={team.logo_url} alt="" /> : <span className="organization-logo-fallback">{team.tag?.slice(0, 3) ?? team.name.slice(0, 2)}</span>}<div><span className="card-kicker">{team.member_role ?? team.recruiting_status.replaceAll("_", " ")}</span><h3>{team.name}</h3></div></div><p>{team.description ?? "Competitive team profile."}</p><div className="button-row">{team.main_platform ? <span className="badge">{team.main_platform}</span> : null}{team.main_game ? <span className="badge">{team.main_game}</span> : null}{team.region ? <span className="badge">{team.region}</span> : null}<span className="badge">{team.member_count} members</span>{team.verification_level ? <span className="badge">✓ {team.verification_level.replaceAll("_", " ")}</span> : null}</div></Link>;
}

export default async function TeamsPage() {
  const session = await requireSession();
  const [myTeams, teams] = await Promise.all([
    query<TeamRow[]>(
      `SELECT t.id, t.slug, t.name, t.tag, t.description, t.logo_url, t.banner_url,
              t.main_platform, t.main_game, t.region, t.recruiting_status, t.verification_level,
              tm.role AS member_role, tm.status AS member_status,
              (SELECT COUNT(*) FROM team_members count_tm WHERE count_tm.team_id = t.id AND count_tm.status = 'ACTIVE') AS member_count
       FROM team_members tm INNER JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ? AND tm.status IN ('ACTIVE', 'INVITED') AND t.profile_status = 'APPROVED'
       ORDER BY FIELD(tm.status, 'INVITED', 'ACTIVE'), t.name`,
      [session.userId],
    ),
    query<TeamRow[]>(
      `SELECT t.id, t.slug, t.name, t.tag, t.description, t.logo_url, t.banner_url,
              t.main_platform, t.main_game, t.region, t.recruiting_status, t.verification_level,
              NULL AS member_role, NULL AS member_status,
              (SELECT COUNT(*) FROM team_members count_tm WHERE count_tm.team_id = t.id AND count_tm.status = 'ACTIVE') AS member_count
       FROM teams t WHERE t.profile_status = 'APPROVED'
       ORDER BY FIELD(t.recruiting_status, 'OPEN', 'INVITE_ONLY', 'CLOSED'), t.name`,
    ),
  ]);

  const invitations = myTeams.filter((team) => team.member_status === "INVITED");
  const activeTeams = myTeams.filter((team) => team.member_status === "ACTIVE");

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Competitive communities</span><h1>Teams</h1><p>Find approved teams, view rosters, apply to open teams, and manage the organizations you own.</p></div><div className="button-row"><Link className="button button-secondary" href="/dashboard/team-server-identity">Team &amp; server identity</Link><Link className="button" href="/dashboard/profile-requests">Request a team profile</Link></div></section>
      {invitations.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Team invitations</h2><p>Accept to join the roster or decline the invitation.</p></div></div><div className="review-grid">{invitations.map((team) => <article className="review-card" key={team.id}><span className="card-kicker">Invited as {team.member_role?.toLowerCase()}</span><h3>{team.name}</h3><p>{team.description ?? "Competitive team profile."}</p><TeamInvitationControls teamId={team.id} /></article>)}</div></section> : null}
      {activeTeams.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Your teams</h2><p>Teams where you have an accepted roster role.</p></div></div><div className="organization-grid">{activeTeams.map((team) => <TeamCard team={team} key={team.id} />)}</div></section> : null}
      <section className="panel section-stack"><div className="section-header"><div><h2>Discover teams</h2><p>Approved teams across Game Night Tools.</p></div></div>{teams.length ? <div className="organization-grid">{teams.map((team) => <TeamCard team={team} key={team.id} />)}</div> : <div className="empty-state">No approved teams are public yet.</div>}</section>
    </div>
  );
}
