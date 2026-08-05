import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";

type ResultRow = RowDataPacket & {
  result_type: string;
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string;
};

async function safeSearch(label: string, task: Promise<ResultRow[]>): Promise<ResultRow[]> {
  try {
    return await task;
  } catch (error) {
    console.error(`Search category failed: ${label}`, error);
    return [];
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  const q = (await searchParams).q?.trim() ?? "";
  let results: ResultRow[] = [];
  let partialFailure = false;

  if (q.length >= 2) {
    const like = `%${q}%`;
    const searches = await Promise.all([
      safeSearch("users", query<ResultRow[]>(
        `SELECT 'USER' AS result_type, CAST(u.id AS CHAR) AS id,
                COALESCE(u.site_username, u.global_name, u.username) AS title,
                CONCAT('@', COALESCE(u.site_username, u.username)) AS subtitle,
                CASE WHEN u.avatar_hash IS NULL THEN NULL
                     ELSE CONCAT('https://cdn.discordapp.com/avatars/', u.discord_id, '/', u.avatar_hash, '.png?size=128')
                END AS image_url,
                CONCAT('/users/', u.site_username) AS href
         FROM users u
         LEFT JOIN user_preferences up ON up.user_id = u.id
         WHERE u.account_status = 'ACTIVE'
           AND u.profile_visibility <> 'PRIVATE'
           AND COALESCE(up.discoverable, 1) = 1
           AND u.site_username IS NOT NULL
           AND (u.site_username LIKE ? OR u.global_name LIKE ? OR u.username LIKE ?)
         ORDER BY CASE WHEN LOWER(u.site_username) = LOWER(?) THEN 0 ELSE 1 END,
                  COALESCE(u.site_username, u.global_name, u.username)
         LIMIT 12`,
        [like, like, like, q],
      )),
      safeSearch("servers", query<ResultRow[]>(
        `SELECT 'SERVER' AS result_type, CAST(w.id AS CHAR) AS id, w.name AS title,
                w.main_game_category AS subtitle,
                COALESCE(w.icon_url, w.banner_url) AS image_url,
                CONCAT('/dashboard/workspaces/', w.id) AS href
         FROM workspaces w
         WHERE w.profile_status = 'APPROVED'
           AND (w.name LIKE ? OR w.description LIKE ? OR w.main_game_category LIKE ?)
         ORDER BY w.name
         LIMIT 12`,
        [like, like, like],
      )),
      safeSearch("teams", query<ResultRow[]>(
        `SELECT 'TEAM' AS result_type, CAST(t.id AS CHAR) AS id, t.name AS title,
                CONCAT_WS(' · ', t.main_platform, t.main_game, t.region) AS subtitle,
                COALESCE(t.logo_url, t.banner_url) AS image_url,
                CONCAT('/teams/', t.slug) AS href
         FROM teams t
         WHERE t.profile_status = 'APPROVED'
           AND (t.name LIKE ? OR t.tag LIKE ? OR t.description LIKE ? OR t.main_game LIKE ?)
         ORDER BY t.name
         LIMIT 12`,
        [like, like, like, like],
      )),
      safeSearch("events", query<ResultRow[]>(
        `SELECT 'EVENT' AS result_type, CAST(e.id AS CHAR) AS id, e.name AS title,
                CONCAT(w.name, ' · ', COALESCE(e.subgame_name, e.game_name, e.platform_name, 'Game night')) AS subtitle,
                e.game_thumbnail_url AS image_url,
                CONCAT('/dashboard/events/', e.id) AS href
         FROM events e
         INNER JOIN workspaces w ON w.id = e.workspace_id
         LEFT JOIN user_guilds ug ON ug.user_id = ? AND ug.guild_id = w.discord_guild_id
         WHERE e.status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'CANCELLED')
           AND (e.visibility = 'PUBLIC' OR (e.visibility = 'SERVER' AND ug.user_id IS NOT NULL))
           AND (e.name LIKE ? OR e.subgame_name LIKE ? OR e.game_name LIKE ? OR e.platform_name LIKE ?)
         ORDER BY COALESCE(e.starts_at, '9999-12-31') ASC
         LIMIT 12`,
        [session.userId, like, like, like, like],
      )),
      safeSearch("suggestions", query<ResultRow[]>(
        `SELECT 'SUGGESTION' AS result_type, CAST(s.id AS CHAR) AS id, s.title,
                CONCAT(s.status, ' · ', s.category) AS subtitle,
                NULL AS image_url,
                CONCAT('/dashboard/suggestions#suggestion-', s.id) AS href
         FROM suggestions s
         WHERE s.scope_type = 'PLATFORM'
           AND (s.title LIKE ? OR s.description LIKE ?)
         ORDER BY s.created_at DESC
         LIMIT 12`,
        [like, like],
      )),
    ]);

    partialFailure = searches.some((items) => items.length === 0) && searches.flat().length > 0;
    results = searches.flat();
  }

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Find anything</span>
          <h1>Search</h1>
          <p>Search public users, approved servers, teams, events, and platform suggestions.</p>
        </div>
      </section>

      <form className="search-form" method="get">
        <input name="q" defaultValue={q} placeholder="Search Game Night Tools" minLength={2} autoFocus />
        <button className="button">Search</button>
      </form>

      {q.length > 0 && q.length < 2 ? <p className="error-banner">Enter at least two characters.</p> : null}
      {partialFailure ? <p className="search-notice">Some categories could not be searched, but the available results are shown below.</p> : null}

      <section className="panel section-stack">
        <div className="section-header">
          <div>
            <h2>{q ? `Results for “${q}”` : "Search the platform"}</h2>
            <p>{results.length ? `${results.length} matching results` : q ? "No matching results" : "Enter a name, game, event, or idea above."}</p>
          </div>
        </div>
        {results.length ? (
          <div className="search-results">
            {results.map((result, index) => (
              <Link className="search-result" href={result.href} key={`${result.result_type}-${result.id}-${index}`}>
                {result.image_url ? <img src={result.image_url} alt="" /> : <span className="list-icon">{result.result_type.slice(0, 2)}</span>}
                <div>
                  <span className="card-kicker">{result.result_type}</span>
                  <strong>{result.title}</strong>
                  {result.subtitle ? <small>{result.subtitle.replaceAll("_", " ")}</small> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state">{q ? "Nothing matched that search yet." : "Search results will appear here."}</div>}
      </section>
    </div>
  );
}
