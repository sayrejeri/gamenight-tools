import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasPlatformPermission } from "@/lib/permissions";

type TeamRow = RowDataPacket & {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  banner_url: string | null;
  main_platform: string | null;
  main_game: string | null;
  region: string | null;
  recruiting_status: string;
  profile_status: string;
  verification_level: string | null;
  member_count: number;
  pending_applications: number;
  updated_at: Date;
};

export default async function StaffTeamsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await requireSession();
  if (!await hasPlatformPermission(session.userId, "MANAGE_TEAMS")) notFound();

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const allowedStatuses = ["PENDING", "APPROVED", "CHANGES_REQUESTED", "DENIED", "SUSPENDED", "ARCHIVED"];
  const status = allowedStatuses.includes(params.status ?? "") ? params.status! : "";
  const like = `%${q}%`;

  const teams = await query<TeamRow[]>(
    `SELECT t.id, t.slug, t.name, t.tag, t.logo_url, t.banner_url, t.main_platform, t.main_game, t.region,
            t.recruiting_status, t.profile_status, t.verification_level, t.updated_at,
            (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id AND tm.status = 'ACTIVE') AS member_count,
            (SELECT COUNT(*) FROM team_applications ta WHERE ta.team_id = t.id AND ta.status = 'PENDING') AS pending_applications
     FROM teams t
     WHERE (? = '' OR t.name LIKE ? OR t.tag LIKE ? OR t.slug LIKE ? OR t.main_game LIKE ?)
       AND (? = '' OR t.profile_status = ?)
     ORDER BY FIELD(t.profile_status, 'APPROVED', 'PENDING', 'CHANGES_REQUESTED', 'SUSPENDED', 'DENIED', 'ARCHIVED'), t.name
     LIMIT 250`,
    [q, like, like, like, like, status, status],
  );

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Platform administration</span><h1>Team profiles</h1><p>Review and edit any registered team profile without joining its roster.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/staff">Staff dashboard</Link><Link className="button button-secondary" href="/dashboard/staff/servers">Server profiles</Link></div>
      </section>

      <form className="staff-user-search" method="get">
        <input name="q" defaultValue={q} placeholder="Search team name, tag, slug, or game" />
        <select name="status" defaultValue={status}>
          <option value="">All profile statuses</option>
          {allowedStatuses.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
        <button className="button">Search</button>
      </form>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>{q || status ? "Matching team profiles" : "All team profiles"}</h2><p>{teams.length} profiles shown. Staff with Manage Team Profiles can open any team for direct profile administration.</p></div></div>
        {teams.length ? (
          <div className="organization-grid">
            {teams.map((team) => (
              <Link
                className="organization-card"
                href={`/dashboard/staff/teams/${team.id}`}
                key={team.id}
                style={team.banner_url ? { backgroundImage: `linear-gradient(180deg, rgba(17,21,34,.28), rgba(17,21,34,.98)), url(${team.banner_url})` } : undefined}
              >
                <div className="organization-card-top">
                  {team.logo_url ? <img src={team.logo_url} alt="" /> : <span className="organization-logo-fallback">{team.tag?.slice(0, 3) ?? team.name.slice(0, 2)}</span>}
                  <div><span className="card-kicker">{team.profile_status.replaceAll("_", " ")}</span><h3>{team.name}</h3></div>
                </div>
                <p>{team.tag ? `[${team.tag}] · ` : ""}{team.main_game ?? team.main_platform ?? "Competitive team"}</p>
                <div className="button-row">
                  {team.region ? <span className="badge">{team.region}</span> : null}
                  {team.verification_level ? <span className="badge">✓ {team.verification_level.replaceAll("_", " ")}</span> : null}
                  <span className="badge">{team.member_count} members</span>
                  <span className="badge">{team.pending_applications} pending</span>
                  <span className="badge">{team.recruiting_status.replaceAll("_", " ")}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state">No team profiles matched those filters.</div>}
      </section>
    </div>
  );
}
