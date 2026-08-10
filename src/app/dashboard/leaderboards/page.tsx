import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  currentCompetitiveSeason,
  loadCompetitiveGames,
  loadDecidedMatchCount,
  loadPlayerLeaderboard,
  loadTeamLeaderboard,
  type CompetitiveFilters,
} from "@/lib/competitive-stats";

type WorkspaceRow = RowDataPacket & { id: string; name: string };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function one(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export default async function LeaderboardsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const params = await searchParams;
  const mode = one(params.mode) === "teams" ? "teams" : "players";
  const scope = one(params.scope) === "season" ? "season" : "all";
  const requestedWorkspaceId = one(params.workspace) || null;
  const game = one(params.game) || null;
  const season = currentCompetitiveSeason();

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT DISTINCT w.id, w.name FROM workspaces w
     INNER JOIN user_guilds ug ON ug.guild_id = w.discord_guild_id
     WHERE ug.user_id = ? AND w.profile_status = 'APPROVED' ORDER BY w.name`,
    [session.userId],
  );
  const allowedWorkspaceIds = workspaces.map((workspace) => workspace.id);
  if (requestedWorkspaceId && !allowedWorkspaceIds.includes(requestedWorkspaceId)) notFound();

  const filters: CompetitiveFilters = {
    workspaceIds: allowedWorkspaceIds,
    workspaceId: requestedWorkspaceId,
    game,
    from: scope === "season" ? season.start : null,
    to: scope === "season" ? season.end : null,
    viewerUserId: session.userId,
  };
  const discoveryFilters: CompetitiveFilters = {
    workspaceIds: allowedWorkspaceIds,
    viewerUserId: session.userId,
  };

  const [games, playerRows, teamRows, totalMatches] = await Promise.all([
    loadCompetitiveGames(discoveryFilters),
    mode === "players" ? loadPlayerLeaderboard(filters) : Promise.resolve([]),
    mode === "teams" ? loadTeamLeaderboard(filters) : Promise.resolve([]),
    loadDecidedMatchCount(filters),
  ]);

  const totalCompetitors = mode === "players" ? playerRows.length : teamRows.length;
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === requestedWorkspaceId)?.name ?? null;
  const scopeLabel = scope === "season" ? season.label : "All time";

  return (
    <div className="section-stack competitive-leaderboard-page">
      <section className="page-heading">
        <div><span className="eyebrow">Competitive hub</span><h1>Leaderboards</h1><p>Compare tournament records across seasons, servers, games, players, and approved teams.</p></div>
        <div className="button-row"><Link className={`button ${mode === "players" ? "" : "button-secondary"}`} href={`/dashboard/leaderboards?mode=players&scope=${scope}`}>Players</Link><Link className={`button ${mode === "teams" ? "" : "button-secondary"}`} href={`/dashboard/leaderboards?mode=teams&scope=${scope}`}>Teams</Link></div>
      </section>

      <section className="competitive-filter-panel panel section-stack">
        <form className="competitive-filter-grid" method="get">
          <input type="hidden" name="mode" value={mode} />
          <label><span>Time period</span><select name="scope" defaultValue={scope}><option value="all">All time</option><option value="season">{season.label}</option></select></label>
          <label><span>Server</span><select name="workspace" defaultValue={requestedWorkspaceId ?? ""}><option value="">All available servers</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select></label>
          <label><span>Game</span><select name="game" defaultValue={game ?? ""}><option value="">All games</option>{games.map((gameName) => <option value={gameName} key={gameName}>{gameName}</option>)}</select></label>
          <button className="button" type="submit">Apply filters</button>
        </form>
        <div className="button-row"><span className="badge">{scopeLabel}</span>{selectedWorkspace ? <span className="badge">{selectedWorkspace}</span> : null}{game ? <span className="badge">{game}</span> : null}</div>
      </section>

      <div className="tournament-stat-grid competitive-summary-grid"><div className="stat-card"><span>{mode === "players" ? "Ranked players" : "Ranked teams"}</span><strong>{totalCompetitors}</strong></div><div className="stat-card"><span>Recorded matches</span><strong>{totalMatches}</strong></div><div className="stat-card"><span>Leaderboard scope</span><strong>{scope === "season" ? "Season" : "Career"}</strong></div><div className="stat-card"><span>Top priority</span><strong>🏆 Titles</strong></div></div>

      {mode === "players" ? (
        playerRows.length ? <section className="panel leaderboard-table-shell"><div className="leaderboard-table"><div className="leaderboard-row leaderboard-head"><span>Rank</span><span>Player</span><span>Record</span><span>Win rate</span><span>Titles</span><span>Best streak</span><span>Events</span></div>{playerRows.map((row, index) => {
          const avatar = getDiscordAvatarUrl(row.discordId, row.avatarHash);
          return <Link className={`leaderboard-row ${index < 3 ? "leaderboard-podium" : ""}`} href={`/users/${row.siteUsername}/competitive`} key={row.userId}><span className="leaderboard-rank">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}</span><span className="leaderboard-identity">{avatar ? <img src={avatar} alt="" /> : <span className="leaderboard-avatar-fallback">{row.displayName.slice(0, 1).toUpperCase()}</span>}<span><strong>{row.displayName}</strong><small>@{row.siteUsername}</small></span></span><span><strong>{row.wins}–{row.losses}</strong><small>{row.matches} matches</small></span><span><strong>{row.winRate}%</strong></span><span><strong>{row.championships}</strong></span><span><strong>{row.bestWinStreak ? `W${row.bestWinStreak}` : "—"}</strong><small>{row.currentStreakType ? `Now ${row.currentStreakType}${row.currentStreak}` : "No streak"}</small></span><span><strong>{row.eventsPlayed}</strong></span></Link>;
        })}</div></section> : <div className="empty-state">No player match results exist for these filters yet.</div>
      ) : (
        teamRows.length ? <section className="panel leaderboard-table-shell"><div className="leaderboard-table"><div className="leaderboard-row leaderboard-head"><span>Rank</span><span>Team</span><span>Record</span><span>Win rate</span><span>Titles</span><span>Best streak</span><span>Events</span></div>{teamRows.map((row, index) => <Link className={`leaderboard-row ${index < 3 ? "leaderboard-podium" : ""}`} href={`/teams/${row.slug}`} key={row.teamId}><span className="leaderboard-rank">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}</span><span className="leaderboard-identity">{row.logoUrl ? <img src={row.logoUrl} alt="" /> : <span className="leaderboard-avatar-fallback">{(row.tag ?? row.name).slice(0, 2).toUpperCase()}</span>}<span><strong>{row.name}</strong><small>{row.tag ? `[${row.tag}]` : "Approved team"}</small></span></span><span><strong>{row.wins}–{row.losses}</strong><small>{row.matches} matches</small></span><span><strong>{row.winRate}%</strong></span><span><strong>{row.championships}</strong></span><span><strong>{row.bestWinStreak ? `W${row.bestWinStreak}` : "—"}</strong><small>{row.currentStreakType ? `Now ${row.currentStreakType}${row.currentStreak}` : "No streak"}</small></span><span><strong>{row.eventsPlayed}</strong></span></Link>)}</div></section> : <div className="empty-state">No team match results exist for these filters yet.</div>
      )}

      <div className="rule-callout"><strong>How ranking works</strong><p>Completed head-to-head matches and staff-decided forfeits count. Automatic byes do not count as wins. Rankings prioritize championships, then wins, win rate, fewer losses, and match volume. Private competitive histories are excluded from player leaderboards.</p></div>
    </div>
  );
}
