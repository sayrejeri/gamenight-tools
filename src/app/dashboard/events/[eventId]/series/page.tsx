import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTournamentAccess } from "@/lib/tournament-access";
import { SeriesReportingDesk, type SeriesDeskMatch, type SeriesGame } from "@/components/series-reporting-desk";

type BracketRow = RowDataPacket & { id: string; status: string };
type MatchRow = RowDataPacket & {
  id: string; round_number: number; match_number: number; stage_label: string | null; group_key: string | null; status: string; best_of: number;
  a_entry_id: string | null; a_user_id: string | null; a_team_id: string | null; a_name: string | null; a_roster_json: string | null;
  b_entry_id: string | null; b_user_id: string | null; b_team_id: string | null; b_name: string | null; b_roster_json: string | null;
  score_a: number | null; score_b: number | null; report_status: string | null; game_results_json: string | null;
};
type RosterMember = { userId: string };

function parseRoster(value: string | null): RosterMember[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const userId = (member as { userId?: unknown }).userId;
      return typeof userId === "string" ? [{ userId }] : [];
    });
  } catch { return []; }
}
function parseGames(value: string | null): SeriesGame[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const game = item as Record<string, unknown>;
      if (typeof game.gameNumber !== "number" || typeof game.mapName !== "string" || typeof game.winnerEntryId !== "string") return [];
      return [{
        gameNumber: game.gameNumber,
        mapName: game.mapName,
        modeName: typeof game.modeName === "string" ? game.modeName : null,
        winnerEntryId: game.winnerEntryId,
        scoreA: typeof game.scoreA === "number" ? game.scoreA : null,
        scoreB: typeof game.scoreB === "number" ? game.scoreB : null,
      }];
    });
  } catch { return []; }
}
function sideContains(userId: string, directUserId: string | null, rosterJson: string | null): boolean {
  return directUserId === userId || parseRoster(rosterJson).some((member) => member.userId === userId);
}

export default async function EventSeriesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const access = await getTournamentAccess(session.userId, eventId);
  if (!access.event || !access.event.bracket_enabled) notFound();

  const brackets = await query<BracketRow[]>(`SELECT id, status FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]);
  const bracket = brackets[0];
  if (!bracket) return <section className="panel section-stack"><h1>Series desk unavailable</h1><p className="muted">Generate and save the event competition first.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;

  const rows = await query<MatchRow[]>(
    `SELECT bm.id, bm.round_number, bm.match_number, bm.stage_label, bm.group_key, bm.status, bm.best_of,
            a.id AS a_entry_id, CAST(a.user_id AS CHAR) AS a_user_id, a.team_id AS a_team_id, a.display_name AS a_name,
            (SELECT ete.roster_json FROM event_team_entries ete WHERE ete.event_id = ? AND ete.team_id = a.team_id LIMIT 1) AS a_roster_json,
            b.id AS b_entry_id, CAST(b.user_id AS CHAR) AS b_user_id, b.team_id AS b_team_id, b.display_name AS b_name,
            (SELECT ete.roster_json FROM event_team_entries ete WHERE ete.event_id = ? AND ete.team_id = b.team_id LIMIT 1) AS b_roster_json,
            mr.score_a, mr.score_b, mr.status AS report_status, mr.game_results_json
     FROM bracket_matches bm
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN match_reports mr ON mr.id = (
       SELECT mr2.id FROM match_reports mr2 WHERE mr2.match_id = bm.id AND mr2.status <> 'VOID' ORDER BY mr2.created_at DESC LIMIT 1
     )
     WHERE bm.bracket_id = ? AND bm.participant_a_entry_id IS NOT NULL AND bm.participant_b_entry_id IS NOT NULL
       AND bm.status IN ('LIVE', 'AWAITING_CONFIRMATION', 'DISPUTED', 'COMPLETED', 'FORFEIT')
     ORDER BY FIELD(bm.status, 'LIVE', 'AWAITING_CONFIRMATION', 'DISPUTED', 'COMPLETED', 'FORFEIT'), bm.round_number ASC, bm.match_number ASC`,
    [eventId, eventId, bracket.id],
  );

  const matches: SeriesDeskMatch[] = rows.flatMap((match) => {
    if (!match.a_entry_id || !match.b_entry_id || !match.a_name || !match.b_name) return [];
    const mineA = sideContains(session.userId, match.a_user_id, match.a_roster_json);
    const mineB = sideContains(session.userId, match.b_user_id, match.b_roster_json);
    if (!access.manager && !mineA && !mineB) return [];
    return [{
      id: match.id,
      label: `${match.stage_label ?? `Round ${match.round_number}`} · Match ${match.match_number}${match.group_key ? ` · Group ${match.group_key}` : ""}`,
      status: match.status,
      bestOf: match.best_of,
      a: { entryId: match.a_entry_id, name: match.a_name, isCurrentUser: mineA },
      b: { entryId: match.b_entry_id, name: match.b_name, isCurrentUser: mineB },
      report: match.report_status ? { scoreA: match.score_a, scoreB: match.score_b, status: match.report_status, games: parseGames(match.game_results_json) } : null,
    }];
  });

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Tournament series</span><h1>{access.event.name} Series Desk</h1><p>Report best-of matches game by game, including maps, modes, winners, and optional per-game scores.</p></div><div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}/matches`}>Match Center</Link><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Event</Link></div></section>
      <div className="rule-callout"><strong>How series reporting works</strong><p>Complete enough game rows for one side to clinch the best-of series. The overall result is then sent to the normal opponent-confirmation flow in Match Center.</p></div>
      <SeriesReportingDesk eventId={eventId} matches={matches} canManage={access.manager} />
    </div>
  );
}
