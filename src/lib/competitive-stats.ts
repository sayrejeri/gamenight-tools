import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export type CompetitiveFilters = {
  workspaceId?: string | null;
  /** Explicit workspace scope. Passing [] intentionally returns no data. */
  workspaceIds?: string[] | null;
  game?: string | null;
  from?: Date | null;
  to?: Date | null;
  /** Viewer whose event/profile/block access should be applied. */
  viewerUserId?: string | null;
  /** Anonymous/public presentation: only PUBLIC events and PUBLIC player profiles. */
  publicOnly?: boolean;
  /** Limit match/champion reads to one linked player. */
  subjectUserId?: string | null;
};

export type SeasonWindow = { label: string; start: Date; end: Date };

export type PlayerLeaderboardEntry = {
  userId: string;
  siteUsername: string;
  displayName: string;
  discordId: string;
  avatarHash: string | null;
  wins: number;
  losses: number;
  matches: number;
  eventsPlayed: number;
  championships: number;
  winRate: number;
  currentStreak: number;
  currentStreakType: "W" | "L" | null;
  bestWinStreak: number;
};

export type TeamLeaderboardEntry = {
  teamId: string;
  slug: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  wins: number;
  losses: number;
  matches: number;
  eventsPlayed: number;
  championships: number;
  winRate: number;
  currentStreak: number;
  currentStreakType: "W" | "L" | null;
  bestWinStreak: number;
};

export type CompetitiveBadge = { key: string; icon: string; name: string; description: string };
export type CompetitiveHistoryItem = {
  eventId: string;
  eventName: string;
  workspaceName: string;
  gameName: string;
  eventStartsAt: Date | null;
  wins: number;
  losses: number;
  champion: boolean;
};
export type CompetitiveRecentMatch = {
  matchId: string;
  eventId: string;
  eventName: string;
  workspaceName: string;
  gameName: string;
  opponentName: string;
  won: boolean;
  decidedAt: Date;
};
export type CompetitiveGameStat = { gameName: string; wins: number; losses: number; matches: number; winRate: number };
export type CompetitiveSnapshot = {
  wins: number;
  losses: number;
  matches: number;
  eventsPlayed: number;
  championships: number;
  winRate: number;
  currentStreak: number;
  currentStreakType: "W" | "L" | null;
  bestWinStreak: number;
};
export type PlayerCompetitiveProfile = {
  allTime: CompetitiveSnapshot;
  season: CompetitiveSnapshot;
  seasonLabel: string;
  attendance: { checkedIn: number; noShows: number; opportunities: number; reliability: number | null };
  history: CompetitiveHistoryItem[];
  recentMatches: CompetitiveRecentMatch[];
  games: CompetitiveGameStat[];
  badges: CompetitiveBadge[];
};

type MatchRow = RowDataPacket & {
  id: string;
  event_id: string;
  event_name: string;
  workspace_id: string;
  workspace_name: string;
  game_name: string;
  event_starts_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
  a_user_id: string | null;
  b_user_id: string | null;
  winner_user_id: string | null;
  a_site_username: string | null;
  b_site_username: string | null;
  a_user_display: string | null;
  b_user_display: string | null;
  a_discord_id: string | null;
  b_discord_id: string | null;
  a_avatar_hash: string | null;
  b_avatar_hash: string | null;
  a_profile_visibility: string | null;
  b_profile_visibility: string | null;
  a_show_event_history: number | null;
  b_show_event_history: number | null;
  a_account_status: string | null;
  b_account_status: string | null;
  a_team_id: string | null;
  b_team_id: string | null;
  winner_team_id: string | null;
  a_team_slug: string | null;
  b_team_slug: string | null;
  a_team_name: string | null;
  b_team_name: string | null;
  a_team_tag: string | null;
  b_team_tag: string | null;
  a_team_logo_url: string | null;
  b_team_logo_url: string | null;
  a_team_profile_status: string | null;
  b_team_profile_status: string | null;
};

type ChampionRow = RowDataPacket & { user_id: string | null; team_id: string | null; event_id: string; decided_at: Date };
type AttendanceRow = RowDataPacket & { status: string; checked_in_at: Date | null };
type CountRow = RowDataPacket & { total: number };
type GameRow = RowDataPacket & { game_name: string };
type BlockRow = RowDataPacket & { blocker_user_id: string; blocked_user_id: string };
type RankSummaryRow = RowDataPacket & { user_id: string; wins: number; losses: number; matches: number };

type Outcome = { won: boolean; at: Date; eventId: string };

type SqlScope = { sql: string; values: unknown[] };

export function currentCompetitiveSeason(now = new Date()): SeasonWindow {
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const start = new Date(Date.UTC(year, quarter * 3, 1));
  const end = new Date(Date.UTC(quarter === 3 ? year + 1 : year, quarter === 3 ? 0 : (quarter + 1) * 3, 1));
  return { label: `${year} Season ${quarter + 1}`, start, end };
}

function eventScopeSql(filters: CompetitiveFilters, dateExpression: string, alias = "e"): SqlScope {
  const clauses: string[] = [`${alias}.status IN ('LIVE', 'COMPLETED')`];
  const values: unknown[] = [];

  if (filters.workspaceIds !== undefined && filters.workspaceIds !== null) {
    if (!filters.workspaceIds.length) clauses.push("1 = 0");
    else {
      clauses.push(`${alias}.workspace_id IN (${filters.workspaceIds.map(() => "?").join(",")})`);
      values.push(...filters.workspaceIds);
    }
  }
  if (filters.workspaceId) { clauses.push(`${alias}.workspace_id = ?`); values.push(filters.workspaceId); }
  if (filters.game) { clauses.push(`COALESCE(${alias}.subgame_name, ${alias}.game_name, ${alias}.platform_name, 'Game Night') = ?`); values.push(filters.game); }
  if (filters.from) { clauses.push(`${dateExpression} >= ?`); values.push(filters.from); }
  if (filters.to) { clauses.push(`${dateExpression} < ?`); values.push(filters.to); }

  const viewerUserId = filters.viewerUserId ?? null;
  if (filters.publicOnly || !viewerUserId) {
    clauses.push(`${alias}.visibility = 'PUBLIC'`);
  } else {
    clauses.push(`(
      ${alias}.visibility = 'PUBLIC'
      OR (${alias}.visibility = 'SERVER' AND EXISTS(
        SELECT 1 FROM user_guilds cug
        INNER JOIN workspaces cgw ON cgw.discord_guild_id = cug.guild_id
        WHERE cug.user_id = ? AND cgw.id = ${alias}.workspace_id
      ))
      OR (${alias}.visibility IN ('UNLISTED', 'CODE_ONLY') AND (
        ${alias}.primary_host_id = ?
        OR EXISTS(SELECT 1 FROM event_cohosts cec WHERE cec.event_id = ${alias}.id AND cec.invited_user_id = ? AND cec.status = 'ACCEPTED')
        OR EXISTS(SELECT 1 FROM event_participants cep WHERE cep.event_id = ${alias}.id AND cep.user_id = ? AND cep.status NOT IN ('REJECTED', 'WITHDRAWN'))
      ))
      OR (${alias}.visibility = 'STAFF_ONLY' AND (
        ${alias}.primary_host_id = ?
        OR EXISTS(SELECT 1 FROM event_cohosts sec WHERE sec.event_id = ${alias}.id AND sec.invited_user_id = ? AND sec.status = 'ACCEPTED')
      ))
    )`);
    values.push(viewerUserId, viewerUserId, viewerUserId, viewerUserId, viewerUserId, viewerUserId);
  }

  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", values };
}

async function loadMatchRows(filters: CompetitiveFilters = {}): Promise<MatchRow[]> {
  const scope = eventScopeSql(filters, "COALESCE(bm.completed_at, bm.updated_at)");
  const subjectSql = filters.subjectUserId ? " AND (a.user_id = ? OR b.user_id = ?)" : "";
  const values = [...scope.values, ...(filters.subjectUserId ? [filters.subjectUserId, filters.subjectUserId] : [])];
  return query<MatchRow[]>(
    `SELECT bm.id, e.id AS event_id, e.name AS event_name, e.workspace_id, w.name AS workspace_name,
            COALESCE(e.subgame_name, e.game_name, e.platform_name, 'Game Night') AS game_name,
            e.starts_at AS event_starts_at, bm.completed_at, bm.updated_at,
            CAST(a.user_id AS CHAR) AS a_user_id, CAST(b.user_id AS CHAR) AS b_user_id,
            CAST(win.user_id AS CHAR) AS winner_user_id,
            ua.site_username AS a_site_username, ub.site_username AS b_site_username,
            COALESCE(ua.global_name, ua.username, a.display_name) AS a_user_display,
            COALESCE(ub.global_name, ub.username, b.display_name) AS b_user_display,
            ua.discord_id AS a_discord_id, ub.discord_id AS b_discord_id,
            ua.avatar_hash AS a_avatar_hash, ub.avatar_hash AS b_avatar_hash,
            ua.profile_visibility AS a_profile_visibility, ub.profile_visibility AS b_profile_visibility,
            COALESCE(upa.show_event_history, 1) AS a_show_event_history,
            COALESCE(upb.show_event_history, 1) AS b_show_event_history,
            ua.account_status AS a_account_status, ub.account_status AS b_account_status,
            a.team_id AS a_team_id, b.team_id AS b_team_id, win.team_id AS winner_team_id,
            ta.slug AS a_team_slug, tb.slug AS b_team_slug,
            ta.name AS a_team_name, tb.name AS b_team_name, ta.tag AS a_team_tag, tb.tag AS b_team_tag,
            ta.logo_url AS a_team_logo_url, tb.logo_url AS b_team_logo_url,
            ta.profile_status AS a_team_profile_status, tb.profile_status AS b_team_profile_status
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries win ON win.id = bm.winner_entry_id
     LEFT JOIN users ua ON ua.id = a.user_id
     LEFT JOIN users ub ON ub.id = b.user_id
     LEFT JOIN user_preferences upa ON upa.user_id = ua.id
     LEFT JOIN user_preferences upb ON upb.user_id = ub.id
     LEFT JOIN teams ta ON ta.id = a.team_id
     LEFT JOIN teams tb ON tb.id = b.team_id
     WHERE bm.status IN ('COMPLETED', 'FORFEIT')
       AND bm.participant_a_entry_id IS NOT NULL AND bm.participant_b_entry_id IS NOT NULL${scope.sql}${subjectSql}
     ORDER BY COALESCE(bm.completed_at, bm.updated_at) ASC, bm.id ASC`,
    values,
  );
}

async function loadChampionRows(filters: CompetitiveFilters = {}): Promise<ChampionRow[]> {
  const scope = eventScopeSql(filters, "COALESCE(br.completed_at, e.starts_at, e.created_at)");
  const subjectSql = filters.subjectUserId ? " AND be.user_id = ?" : "";
  return query<ChampionRow[]>(
    `SELECT CAST(be.user_id AS CHAR) AS user_id, be.team_id, br.event_id,
            COALESCE(br.completed_at, e.starts_at, e.created_at) AS decided_at
     FROM bracket_entries be
     INNER JOIN brackets br ON br.id = be.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     WHERE be.status = 'ADVANCED' AND br.status = 'COMPLETED'
       AND (be.user_id IS NOT NULL OR be.team_id IS NOT NULL)${scope.sql}${subjectSql}`,
    [...scope.values, ...(filters.subjectUserId ? [filters.subjectUserId] : [])],
  );
}

async function loadBlockedUsers(viewerUserId: string | null | undefined, candidateIds: string[]): Promise<Set<string>> {
  if (!viewerUserId || !candidateIds.length) return new Set();
  const ids = [...new Set(candidateIds.filter((id) => id !== viewerUserId))];
  if (!ids.length) return new Set();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await query<BlockRow[]>(
    `SELECT CAST(blocker_user_id AS CHAR) AS blocker_user_id, CAST(blocked_user_id AS CHAR) AS blocked_user_id
     FROM user_blocks
     WHERE (blocker_user_id = ? AND blocked_user_id IN (${placeholders}))
        OR (blocked_user_id = ? AND blocker_user_id IN (${placeholders}))`,
    [viewerUserId, ...ids, viewerUserId, ...ids],
  );
  const blocked = new Set<string>();
  for (const row of rows) blocked.add(row.blocker_user_id === viewerUserId ? row.blocked_user_id : row.blocker_user_id);
  return blocked;
}

function blockPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function loadBlockPairs(anchorIds: string[], candidateIds: string[]): Promise<Set<string>> {
  const anchors = [...new Set(anchorIds.filter(Boolean))];
  const candidates = [...new Set(candidateIds.filter(Boolean))];
  if (!anchors.length || !candidates.length) return new Set();
  const anchorPlaceholders = anchors.map(() => "?").join(",");
  const candidatePlaceholders = candidates.map(() => "?").join(",");
  const rows = await query<BlockRow[]>(
    `SELECT CAST(blocker_user_id AS CHAR) AS blocker_user_id, CAST(blocked_user_id AS CHAR) AS blocked_user_id
     FROM user_blocks
     WHERE (blocker_user_id IN (${anchorPlaceholders}) AND blocked_user_id IN (${candidatePlaceholders}))
        OR (blocked_user_id IN (${anchorPlaceholders}) AND blocker_user_id IN (${candidatePlaceholders}))`,
    [...anchors, ...candidates, ...anchors, ...candidates],
  );
  return new Set(rows.map((row) => blockPairKey(row.blocker_user_id, row.blocked_user_id)));
}

function streak(outcomes: Outcome[]): { currentStreak: number; currentStreakType: "W" | "L" | null; bestWinStreak: number } {
  if (!outcomes.length) return { currentStreak: 0, currentStreakType: null, bestWinStreak: 0 };
  let bestWinStreak = 0;
  let runningWins = 0;
  for (const outcome of outcomes) {
    if (outcome.won) { runningWins += 1; bestWinStreak = Math.max(bestWinStreak, runningWins); }
    else runningWins = 0;
  }
  const latest = outcomes[outcomes.length - 1].won;
  let currentStreak = 0;
  for (let index = outcomes.length - 1; index >= 0; index -= 1) {
    if (outcomes[index].won !== latest) break;
    currentStreak += 1;
  }
  return { currentStreak, currentStreakType: latest ? "W" : "L", bestWinStreak };
}

function rate(wins: number, losses: number): number {
  const total = wins + losses;
  return total ? Math.round((wins / total) * 1000) / 10 : 0;
}

function playerSideEligible(input: {
  id: string | null; site: string | null; name: string | null; discord: string | null;
  visibility: string | null; show: number | null; accountStatus: string | null;
}, publicOnly: boolean): boolean {
  if (!input.id || !input.site || !input.name || !input.discord) return false;
  if (input.accountStatus !== "ACTIVE" || Number(input.show ?? 1) !== 1) return false;
  if (publicOnly) return input.visibility === "PUBLIC";
  return input.visibility !== "PRIVATE";
}

export async function loadPlayerLeaderboard(filters: CompetitiveFilters = {}): Promise<PlayerLeaderboardEntry[]> {
  const [rows, champions] = await Promise.all([loadMatchRows(filters), loadChampionRows(filters)]);
  const candidateIds = rows.flatMap((row) => [row.a_user_id, row.b_user_id]).filter((id): id is string => Boolean(id));
  const blocked = await loadBlockedUsers(filters.viewerUserId, candidateIds);
  const championshipMap = new Map<string, number>();
  for (const row of champions) if (row.user_id) championshipMap.set(row.user_id, (championshipMap.get(row.user_id) ?? 0) + 1);

  const records = new Map<string, {
    siteUsername: string; displayName: string; discordId: string; avatarHash: string | null;
    wins: number; losses: number; events: Set<string>; outcomes: Outcome[];
  }>();
  const publicOnly = Boolean(filters.publicOnly || !filters.viewerUserId);
  for (const row of rows) {
    const sides = [
      { id: row.a_user_id, site: row.a_site_username, name: row.a_user_display, discord: row.a_discord_id, avatar: row.a_avatar_hash, visibility: row.a_profile_visibility, show: row.a_show_event_history, accountStatus: row.a_account_status },
      { id: row.b_user_id, site: row.b_site_username, name: row.b_user_display, discord: row.b_discord_id, avatar: row.b_avatar_hash, visibility: row.b_profile_visibility, show: row.b_show_event_history, accountStatus: row.b_account_status },
    ];
    for (const side of sides) {
      if (!playerSideEligible(side, publicOnly) || !side.id || blocked.has(side.id)) continue;
      const record = records.get(side.id) ?? { siteUsername: side.site!, displayName: side.name!, discordId: side.discord!, avatarHash: side.avatar, wins: 0, losses: 0, events: new Set<string>(), outcomes: [] };
      const won = row.winner_user_id === side.id;
      if (won) record.wins += 1; else record.losses += 1;
      record.events.add(row.event_id);
      record.outcomes.push({ won, at: new Date(row.completed_at ?? row.updated_at), eventId: row.event_id });
      records.set(side.id, record);
    }
  }

  return [...records.entries()].map(([userId, record]) => {
    const streaks = streak(record.outcomes);
    return {
      userId, siteUsername: record.siteUsername, displayName: record.displayName, discordId: record.discordId,
      avatarHash: record.avatarHash, wins: record.wins, losses: record.losses, matches: record.wins + record.losses,
      eventsPlayed: record.events.size, championships: championshipMap.get(userId) ?? 0,
      winRate: rate(record.wins, record.losses), ...streaks,
    };
  }).sort((a, b) => b.championships - a.championships || b.wins - a.wins || b.winRate - a.winRate || a.losses - b.losses || b.matches - a.matches || a.displayName.localeCompare(b.displayName));
}

export async function loadTeamLeaderboard(filters: CompetitiveFilters = {}): Promise<TeamLeaderboardEntry[]> {
  const [rows, champions] = await Promise.all([loadMatchRows(filters), loadChampionRows(filters)]);
  const championshipMap = new Map<string, number>();
  for (const row of champions) if (row.team_id) championshipMap.set(row.team_id, (championshipMap.get(row.team_id) ?? 0) + 1);

  const records = new Map<string, { slug: string; name: string; tag: string | null; logoUrl: string | null; wins: number; losses: number; events: Set<string>; outcomes: Outcome[] }>();
  for (const row of rows) {
    const sides = [
      { id: row.a_team_id, slug: row.a_team_slug, name: row.a_team_name, tag: row.a_team_tag, logo: row.a_team_logo_url, status: row.a_team_profile_status },
      { id: row.b_team_id, slug: row.b_team_slug, name: row.b_team_name, tag: row.b_team_tag, logo: row.b_team_logo_url, status: row.b_team_profile_status },
    ];
    for (const side of sides) {
      if (!side.id || !side.slug || !side.name || side.status !== "APPROVED") continue;
      const record = records.get(side.id) ?? { slug: side.slug, name: side.name, tag: side.tag, logoUrl: side.logo, wins: 0, losses: 0, events: new Set<string>(), outcomes: [] };
      const won = row.winner_team_id === side.id;
      if (won) record.wins += 1; else record.losses += 1;
      record.events.add(row.event_id);
      record.outcomes.push({ won, at: new Date(row.completed_at ?? row.updated_at), eventId: row.event_id });
      records.set(side.id, record);
    }
  }
  return [...records.entries()].map(([teamId, record]) => {
    const streaks = streak(record.outcomes);
    return { teamId, slug: record.slug, name: record.name, tag: record.tag, logoUrl: record.logoUrl, wins: record.wins, losses: record.losses, matches: record.wins + record.losses, eventsPlayed: record.events.size, championships: championshipMap.get(teamId) ?? 0, winRate: rate(record.wins, record.losses), ...streaks };
  }).sort((a, b) => b.championships - a.championships || b.wins - a.wins || b.winRate - a.winRate || a.losses - b.losses || b.matches - a.matches || a.name.localeCompare(b.name));
}

export async function loadDecidedMatchCount(filters: CompetitiveFilters = {}): Promise<number> {
  const scope = eventScopeSql(filters, "COALESCE(bm.completed_at, bm.updated_at)");
  const rows = await query<CountRow[]>(
    `SELECT COUNT(DISTINCT bm.id) AS total
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     WHERE bm.status IN ('COMPLETED', 'FORFEIT')
       AND bm.participant_a_entry_id IS NOT NULL AND bm.participant_b_entry_id IS NOT NULL${scope.sql}`,
    scope.values,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function loadCompetitiveGames(filters: CompetitiveFilters = {}): Promise<string[]> {
  const scope = eventScopeSql({ ...filters, game: null }, "COALESCE(bm.completed_at, bm.updated_at)");
  const rows = await query<GameRow[]>(
    `SELECT DISTINCT COALESCE(e.subgame_name, e.game_name, e.platform_name, 'Game Night') AS game_name
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     WHERE bm.status IN ('COMPLETED', 'FORFEIT')${scope.sql}
     ORDER BY game_name`,
    scope.values,
  );
  return rows.map((row) => row.game_name);
}

async function loadPlayerRankSummaries(filters: CompetitiveFilters = {}): Promise<Array<{ userId: string; wins: number; losses: number; matches: number; championships: number; winRate: number }>> {
  const scopeA = eventScopeSql(filters, "COALESCE(bm.completed_at, bm.updated_at)");
  const scopeB = eventScopeSql(filters, "COALESCE(bm.completed_at, bm.updated_at)");
  const publicOnly = Boolean(filters.publicOnly || !filters.viewerUserId);
  const rows = await query<RankSummaryRow[]>(
    `SELECT s.user_id, SUM(s.won) AS wins, COUNT(*) - SUM(s.won) AS losses, COUNT(*) AS matches
     FROM (
       SELECT CAST(a.user_id AS CHAR) AS user_id, CASE WHEN win.user_id = a.user_id THEN 1 ELSE 0 END AS won
       FROM bracket_matches bm
       INNER JOIN brackets br ON br.id = bm.bracket_id
       INNER JOIN events e ON e.id = br.event_id
       LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
       LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
       LEFT JOIN bracket_entries win ON win.id = bm.winner_entry_id
       WHERE bm.status IN ('COMPLETED', 'FORFEIT') AND a.user_id IS NOT NULL
         AND bm.participant_a_entry_id IS NOT NULL AND bm.participant_b_entry_id IS NOT NULL${scopeA.sql}
       UNION ALL
       SELECT CAST(b.user_id AS CHAR) AS user_id, CASE WHEN win.user_id = b.user_id THEN 1 ELSE 0 END AS won
       FROM bracket_matches bm
       INNER JOIN brackets br ON br.id = bm.bracket_id
       INNER JOIN events e ON e.id = br.event_id
       LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
       LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
       LEFT JOIN bracket_entries win ON win.id = bm.winner_entry_id
       WHERE bm.status IN ('COMPLETED', 'FORFEIT') AND b.user_id IS NOT NULL
         AND bm.participant_a_entry_id IS NOT NULL AND bm.participant_b_entry_id IS NOT NULL${scopeB.sql}
     ) s
     INNER JOIN users u ON u.id = s.user_id
     LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE u.account_status = 'ACTIVE' AND u.site_username IS NOT NULL
       AND COALESCE(up.show_event_history, 1) = 1
       AND ${publicOnly ? "u.profile_visibility = 'PUBLIC'" : "u.profile_visibility <> 'PRIVATE'"}
     GROUP BY s.user_id`,
    [...scopeA.values, ...scopeB.values],
  );
  const blocked = await loadBlockedUsers(filters.viewerUserId, rows.map((row) => row.user_id));
  const champions = await loadChampionRows(filters);
  const championshipMap = new Map<string, number>();
  for (const champion of champions) if (champion.user_id) championshipMap.set(champion.user_id, (championshipMap.get(champion.user_id) ?? 0) + 1);
  return rows.filter((row) => !blocked.has(row.user_id)).map((row) => {
    const wins = Number(row.wins ?? 0);
    const losses = Number(row.losses ?? 0);
    return { userId: row.user_id, wins, losses, matches: Number(row.matches ?? 0), championships: championshipMap.get(row.user_id) ?? 0, winRate: rate(wins, losses) };
  }).sort((a, b) => b.championships - a.championships || b.wins - a.wins || b.winRate - a.winRate || a.losses - b.losses || b.matches - a.matches || a.userId.localeCompare(b.userId));
}

export async function loadPlayerRank(userId: string, filters: CompetitiveFilters = {}): Promise<number | null> {
  const rows = await loadPlayerRankSummaries(filters);
  const index = rows.findIndex((row) => row.userId === userId);
  return index >= 0 ? index + 1 : null;
}

function snapshotForUser(rows: MatchRow[], championshipCount: number, userId: string): CompetitiveSnapshot {
  let wins = 0;
  let losses = 0;
  const events = new Set<string>();
  const outcomes: Outcome[] = [];
  for (const row of rows) {
    if (row.a_user_id !== userId && row.b_user_id !== userId) continue;
    const won = row.winner_user_id === userId;
    if (won) wins += 1; else losses += 1;
    events.add(row.event_id);
    outcomes.push({ won, at: new Date(row.completed_at ?? row.updated_at), eventId: row.event_id });
  }
  const streaks = streak(outcomes);
  return { wins, losses, matches: wins + losses, eventsPlayed: events.size, championships: championshipCount, winRate: rate(wins, losses), ...streaks };
}

export async function loadPlayerCompetitiveProfile(userId: string, viewerUserId: string | null = null): Promise<PlayerCompetitiveProfile> {
  const season = currentCompetitiveSeason();
  const baseFilters: CompetitiveFilters = { viewerUserId, publicOnly: !viewerUserId, subjectUserId: userId };
  const attendanceScope = eventScopeSql({ viewerUserId, publicOnly: !viewerUserId }, "COALESCE(e.starts_at, e.created_at)");
  const [allRows, championRows, attendanceRows] = await Promise.all([
    loadMatchRows(baseFilters),
    loadChampionRows(baseFilters),
    query<AttendanceRow[]>(
      `SELECT ep.status, ep.checked_in_at
       FROM event_participants ep
       INNER JOIN events e ON e.id = ep.event_id
       WHERE ep.user_id = ? AND e.status = 'COMPLETED'
         AND ep.status NOT IN ('REJECTED', 'WITHDRAWN')${attendanceScope.sql}`,
      [userId, ...attendanceScope.values],
    ),
  ]);

  const championEvents = new Set(championRows.map((row) => row.event_id));
  const seasonChampionEvents = new Set(championRows
    .filter((row) => {
      const at = new Date(row.decided_at).getTime();
      return at >= season.start.getTime() && at < season.end.getTime();
    })
    .map((row) => row.event_id));
  const seasonRows = allRows.filter((row) => {
    const at = new Date(row.completed_at ?? row.updated_at).getTime();
    return at >= season.start.getTime() && at < season.end.getTime();
  });

  const opponentIds = allRows.flatMap((row) => {
    if (row.a_user_id === userId) return row.b_user_id ? [row.b_user_id] : [];
    if (row.b_user_id === userId) return row.a_user_id ? [row.a_user_id] : [];
    return [];
  });
  const blockPairs = await loadBlockPairs([userId, ...(viewerUserId && viewerUserId !== userId ? [viewerUserId] : [])], opponentIds);

  const eventMap = new Map<string, CompetitiveHistoryItem>();
  const recentMatches: CompetitiveRecentMatch[] = [];
  const gameMap = new Map<string, { wins: number; losses: number }>();
  for (const row of allRows) {
    const userOnA = row.a_user_id === userId;
    if (!userOnA && row.b_user_id !== userId) continue;
    const won = row.winner_user_id === userId;
    const opponentId = userOnA ? row.b_user_id : row.a_user_id;
    const opponentDisplay = userOnA ? row.b_user_display : row.a_user_display;
    const opponentVisibility = userOnA ? row.b_profile_visibility : row.a_profile_visibility;
    const opponentShowHistory = userOnA ? row.b_show_event_history : row.a_show_event_history;
    const opponentAccountStatus = userOnA ? row.b_account_status : row.a_account_status;
    let opponentName = opponentDisplay ?? "Opponent";
    if (opponentId) {
      const blockedWithSubject = blockPairs.has(blockPairKey(userId, opponentId));
      const blockedWithViewer = viewerUserId ? blockPairs.has(blockPairKey(viewerUserId, opponentId)) : false;
      const visibilityAllowed = opponentId === viewerUserId
        || (opponentVisibility === "PUBLIC")
        || (Boolean(viewerUserId) && opponentVisibility === "MEMBERS");
      if (opponentAccountStatus !== "ACTIVE" || Number(opponentShowHistory ?? 1) !== 1 || !visibilityAllowed || blockedWithSubject || blockedWithViewer) {
        opponentName = "Private opponent";
      }
    }

    const history = eventMap.get(row.event_id) ?? {
      eventId: row.event_id,
      eventName: row.event_name,
      workspaceName: row.workspace_name,
      gameName: row.game_name,
      eventStartsAt: row.event_starts_at,
      wins: 0,
      losses: 0,
      champion: championEvents.has(row.event_id),
    };
    if (won) history.wins += 1; else history.losses += 1;
    eventMap.set(row.event_id, history);
    recentMatches.push({ matchId: row.id, eventId: row.event_id, eventName: row.event_name, workspaceName: row.workspace_name, gameName: row.game_name, opponentName, won, decidedAt: new Date(row.completed_at ?? row.updated_at) });
    const game = gameMap.get(row.game_name) ?? { wins: 0, losses: 0 };
    if (won) game.wins += 1; else game.losses += 1;
    gameMap.set(row.game_name, game);
  }

  const allTime = snapshotForUser(allRows, championEvents.size, userId);
  const seasonSnapshot = snapshotForUser(seasonRows, seasonChampionEvents.size, userId);
  const checkedIn = attendanceRows.filter((row) => Boolean(row.checked_in_at)).length;
  const noShows = attendanceRows.filter((row) => row.status === "NO_SHOW").length;
  const opportunities = checkedIn + noShows;
  const reliability = opportunities ? Math.round((checkedIn / opportunities) * 1000) / 10 : null;
  const history = [...eventMap.values()].sort((a, b) => new Date(b.eventStartsAt ?? 0).getTime() - new Date(a.eventStartsAt ?? 0).getTime()).slice(0, 24);
  const games = [...gameMap.entries()].map(([gameName, record]) => ({ gameName, wins: record.wins, losses: record.losses, matches: record.wins + record.losses, winRate: rate(record.wins, record.losses) })).sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.gameName.localeCompare(b.gameName));
  const badges: CompetitiveBadge[] = [];
  if (allTime.championships >= 1) badges.push({ key: "champion", icon: "🏆", name: "Tournament Champion", description: "Won a completed tournament." });
  if (allTime.championships >= 3) badges.push({ key: "dynasty", icon: "👑", name: "Dynasty", description: "Won at least three tournaments." });
  if (allTime.bestWinStreak >= 5) badges.push({ key: "streak", icon: "🔥", name: "On Fire", description: `Reached a ${allTime.bestWinStreak}-match win streak.` });
  if (allTime.eventsPlayed >= 10) badges.push({ key: "veteran", icon: "🎮", name: "Tournament Veteran", description: "Played in at least ten competitive events." });
  if (allTime.matches >= 25) badges.push({ key: "iron", icon: "⚔️", name: "Battle Tested", description: "Completed at least 25 competitive matches." });
  if (reliability != null && opportunities >= 5 && reliability >= 90) badges.push({ key: "reliable", icon: "✅", name: "Reliable", description: `${reliability}% check-in reliability across tracked events.` });
  if (history.some((event) => event.champion && event.losses === 0 && event.wins > 0)) badges.push({ key: "perfect", icon: "💯", name: "Perfect Tournament", description: "Won a tournament without a recorded match loss." });
  return { allTime, season: seasonSnapshot, seasonLabel: season.label, attendance: { checkedIn, noShows, opportunities, reliability }, history, recentMatches: recentMatches.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime()).slice(0, 12), games: games.slice(0, 12), badges };
}
