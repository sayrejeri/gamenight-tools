import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export type CompetitiveFilters = {
  workspaceId?: string | null;
  game?: string | null;
  from?: Date | null;
  to?: Date | null;
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

type ChampionRow = RowDataPacket & { user_id: string | null; team_id: string | null };
type AttendanceRow = RowDataPacket & { status: string; checked_in_at: Date | null };

type Outcome = { won: boolean; at: Date; eventId: string };

export function currentCompetitiveSeason(now = new Date()): SeasonWindow {
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const start = new Date(Date.UTC(year, quarter * 3, 1));
  const end = new Date(Date.UTC(quarter === 3 ? year + 1 : year, quarter === 3 ? 0 : (quarter + 1) * 3, 1));
  return { label: `${year} Season ${quarter + 1}`, start, end };
}

function filterSql(filters: CompetitiveFilters, dateExpression: string): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.workspaceId) { clauses.push("e.workspace_id = ?"); values.push(filters.workspaceId); }
  if (filters.game) { clauses.push("COALESCE(e.subgame_name, e.game_name, e.platform_name, 'Game Night') = ?"); values.push(filters.game); }
  if (filters.from) { clauses.push(`${dateExpression} >= ?`); values.push(filters.from); }
  if (filters.to) { clauses.push(`${dateExpression} < ?`); values.push(filters.to); }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", values };
}

async function loadMatchRows(filters: CompetitiveFilters = {}): Promise<MatchRow[]> {
  const extra = filterSql(filters, "COALESCE(bm.completed_at, bm.updated_at)");
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
       AND bm.participant_a_entry_id IS NOT NULL AND bm.participant_b_entry_id IS NOT NULL${extra.sql}
     ORDER BY COALESCE(bm.completed_at, bm.updated_at) ASC, bm.id ASC`,
    extra.values,
  );
}

async function loadChampionRows(filters: CompetitiveFilters = {}): Promise<ChampionRow[]> {
  const extra = filterSql(filters, "COALESCE(br.completed_at, e.starts_at, e.created_at)");
  return query<ChampionRow[]>(
    `SELECT CAST(be.user_id AS CHAR) AS user_id, be.team_id
     FROM bracket_entries be
     INNER JOIN brackets br ON br.id = be.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     WHERE be.status = 'ADVANCED' AND br.status = 'COMPLETED'
       AND (be.user_id IS NOT NULL OR be.team_id IS NOT NULL)${extra.sql}`,
    extra.values,
  );
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

export async function loadPlayerLeaderboard(filters: CompetitiveFilters = {}): Promise<PlayerLeaderboardEntry[]> {
  const [rows, champions] = await Promise.all([loadMatchRows(filters), loadChampionRows(filters)]);
  const championshipMap = new Map<string, number>();
  for (const row of champions) if (row.user_id) championshipMap.set(row.user_id, (championshipMap.get(row.user_id) ?? 0) + 1);

  const records = new Map<string, {
    siteUsername: string; displayName: string; discordId: string; avatarHash: string | null;
    wins: number; losses: number; events: Set<string>; outcomes: Outcome[];
  }>();
  for (const row of rows) {
    const sides = [
      { id: row.a_user_id, site: row.a_site_username, name: row.a_user_display, discord: row.a_discord_id, avatar: row.a_avatar_hash, visibility: row.a_profile_visibility, show: row.a_show_event_history },
      { id: row.b_user_id, site: row.b_site_username, name: row.b_user_display, discord: row.b_discord_id, avatar: row.b_avatar_hash, visibility: row.b_profile_visibility, show: row.b_show_event_history },
    ];
    for (const side of sides) {
      if (!side.id || !side.site || !side.name || !side.discord || side.visibility === "PRIVATE" || Number(side.show ?? 1) !== 1) continue;
      const record = records.get(side.id) ?? { siteUsername: side.site, displayName: side.name, discordId: side.discord, avatarHash: side.avatar, wins: 0, losses: 0, events: new Set<string>(), outcomes: [] };
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

function snapshotForUser(rows: MatchRow[], champions: Set<string>, userId: string): CompetitiveSnapshot {
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
  return { wins, losses, matches: wins + losses, eventsPlayed: events.size, championships: champions.size, winRate: rate(wins, losses), ...streaks };
}

export async function loadPlayerCompetitiveProfile(userId: string): Promise<PlayerCompetitiveProfile> {
  const season = currentCompetitiveSeason();
  const [allRows, allChampions, seasonRows, seasonChampions, attendanceRows] = await Promise.all([
    loadMatchRows(),
    loadChampionRows(),
    loadMatchRows({ from: season.start, to: season.end }),
    loadChampionRows({ from: season.start, to: season.end }),
    query<AttendanceRow[]>(
      `SELECT ep.status, ep.checked_in_at FROM event_participants ep
       INNER JOIN events e ON e.id = ep.event_id
       WHERE ep.user_id = ? AND e.status = 'COMPLETED' AND ep.status NOT IN ('REJECTED', 'WITHDRAWN')`,
      [userId],
    ),
  ]);
  const championEvents = new Set<string>();
  const championEventRows = await query<(RowDataPacket & { event_id: string })[]>(
    `SELECT DISTINCT br.event_id FROM bracket_entries be INNER JOIN brackets br ON br.id = be.bracket_id
     WHERE be.user_id = ? AND be.status = 'ADVANCED' AND br.status = 'COMPLETED'`,
    [userId],
  );
  championEventRows.forEach((row) => championEvents.add(row.event_id));
  const seasonChampionCount = seasonChampions.filter((row) => row.user_id === userId).length;
  const allChampionCount = allChampions.filter((row) => row.user_id === userId).length;
  const allChampionKeys = new Set(Array.from({ length: allChampionCount }, (_, index) => `c${index}`));
  const seasonChampionKeys = new Set(Array.from({ length: seasonChampionCount }, (_, index) => `s${index}`));
  const targetRows = allRows.filter((row) => row.a_user_id === userId || row.b_user_id === userId);
  const eventMap = new Map<string, CompetitiveHistoryItem>();
  const recentMatches: CompetitiveRecentMatch[] = [];
  const gameMap = new Map<string, { wins: number; losses: number }>();
  for (const row of targetRows) {
    const won = row.winner_user_id === userId;
    const opponentName = row.a_user_id === userId ? (row.b_user_display ?? "Opponent") : (row.a_user_display ?? "Opponent");
    const history = eventMap.get(row.event_id) ?? { eventId: row.event_id, eventName: row.event_name, workspaceName: row.workspace_name, gameName: row.game_name, eventStartsAt: row.event_starts_at, wins: 0, losses: 0, champion: championEvents.has(row.event_id) };
    if (won) history.wins += 1; else history.losses += 1;
    eventMap.set(row.event_id, history);
    recentMatches.push({ matchId: row.id, eventId: row.event_id, eventName: row.event_name, workspaceName: row.workspace_name, gameName: row.game_name, opponentName, won, decidedAt: new Date(row.completed_at ?? row.updated_at) });
    const game = gameMap.get(row.game_name) ?? { wins: 0, losses: 0 };
    if (won) game.wins += 1; else game.losses += 1;
    gameMap.set(row.game_name, game);
  }
  const allTime = snapshotForUser(targetRows, allChampionKeys, userId);
  const seasonSnapshot = snapshotForUser(seasonRows.filter((row) => row.a_user_id === userId || row.b_user_id === userId), seasonChampionKeys, userId);
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
