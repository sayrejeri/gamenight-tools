import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, withTransaction } from "@/lib/db";
import { getTournamentAccess } from "@/lib/tournament-access";
import { writeAuditLog } from "@/lib/audit";

const gameSchema = z.object({
  gameNumber: z.number().int().min(1).max(9),
  mapName: z.string().trim().min(1).max(191),
  modeName: z.string().trim().max(80).optional().default(""),
  winnerEntryId: z.string().uuid(),
  scoreA: z.number().int().min(0).max(999).nullable().optional(),
  scoreB: z.number().int().min(0).max(999).nullable().optional(),
});
const reportSchema = z.object({
  matchId: z.string().uuid(),
  games: z.array(gameSchema).min(1).max(9),
  proofUrl: z.string().trim().url().max(1000).or(z.literal("")).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});

type BracketRow = RowDataPacket & { id: string; status: string };
type MatchRow = RowDataPacket & {
  id: string;
  bracket_id: string;
  round_number: number;
  match_number: number;
  stage_label: string | null;
  status: string;
  best_of: number;
  participant_a_entry_id: string;
  participant_b_entry_id: string;
  a_user_id: string | null;
  b_user_id: string | null;
  a_team_id: string | null;
  b_team_id: string | null;
  a_name: string;
  b_name: string;
};
type TeamSnapshotRow = RowDataPacket & { team_id: string; roster_json: string | null };
type SettingsRow = RowDataPacket & { confirmation_minutes: number; paused_at: Date | null };

type EntryUsers = { a: Set<string>; b: Set<string> };
class SeriesConflict extends Error {}

function rosterUserIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const userId = (member as { userId?: unknown }).userId;
      return typeof userId === "string" ? [userId] : [];
    });
  } catch { return []; }
}

async function loadEntryUsers(connection: PoolConnection, eventId: string, match: MatchRow): Promise<EntryUsers> {
  const users: EntryUsers = { a: new Set<string>(), b: new Set<string>() };
  if (match.a_user_id) users.a.add(match.a_user_id);
  if (match.b_user_id) users.b.add(match.b_user_id);
  const teamIds = [match.a_team_id, match.b_team_id].filter((value): value is string => Boolean(value));
  if (teamIds.length) {
    const placeholders = teamIds.map(() => "?").join(",");
    const [rows] = await connection.query<TeamSnapshotRow[]>(
      `SELECT team_id, roster_json FROM event_team_entries
       WHERE event_id = ? AND team_id IN (${placeholders}) AND status = 'REGISTERED'`,
      [eventId, ...teamIds],
    );
    for (const row of rows) {
      const target = row.team_id === match.a_team_id ? users.a : row.team_id === match.b_team_id ? users.b : null;
      if (target) rosterUserIds(row.roster_json).forEach((userId) => target.add(userId));
    }
  }
  return users;
}

function participantSide(users: EntryUsers, userId: string): "A" | "B" | null {
  const inA = users.a.has(userId);
  const inB = users.b.has(userId);
  if (inA && inB) throw new SeriesConflict("Your account is listed on both sides of this match. Tournament staff must correct the team rosters first.");
  return inA ? "A" : inB ? "B" : null;
}

function validateSeries(match: MatchRow, games: z.infer<typeof gameSchema>[]) {
  if (![1, 3, 5, 7, 9].includes(match.best_of)) throw new SeriesConflict("This match has an invalid best-of setting.");
  if (games.length > match.best_of) throw new SeriesConflict(`A best-of-${match.best_of} series cannot contain ${games.length} reported games.`);
  const sorted = [...games].sort((a, b) => a.gameNumber - b.gameNumber);
  sorted.forEach((game, index) => {
    if (game.gameNumber !== index + 1) throw new SeriesConflict("Series games must be numbered in order starting at Game 1.");
    if (![match.participant_a_entry_id, match.participant_b_entry_id].includes(game.winnerEntryId)) throw new SeriesConflict(`Game ${game.gameNumber} has a winner who is not in this match.`);
    if ((game.scoreA == null) !== (game.scoreB == null)) throw new SeriesConflict(`Enter both scores for Game ${game.gameNumber}, or leave both blank.`);
    if (game.scoreA != null && game.scoreB != null) {
      if (game.scoreA === game.scoreB) throw new SeriesConflict(`Game ${game.gameNumber} cannot end tied.`);
      if (game.winnerEntryId === match.participant_a_entry_id && game.scoreA <= game.scoreB) throw new SeriesConflict(`Game ${game.gameNumber} score does not match the selected winner.`);
      if (game.winnerEntryId === match.participant_b_entry_id && game.scoreB <= game.scoreA) throw new SeriesConflict(`Game ${game.gameNumber} score does not match the selected winner.`);
    }
  });

  const requiredWins = Math.floor(match.best_of / 2) + 1;
  let winsA = 0;
  let winsB = 0;
  sorted.forEach((game, index) => {
    if (winsA >= requiredWins || winsB >= requiredWins) throw new SeriesConflict("The series includes games after a winner had already clinched the match.");
    if (game.winnerEntryId === match.participant_a_entry_id) winsA += 1; else winsB += 1;
    if (index < sorted.length - 1 && (winsA >= requiredWins || winsB >= requiredWins)) throw new SeriesConflict("The series includes games after a winner had already clinched the match.");
  });
  if (winsA < requiredWins && winsB < requiredWins) throw new SeriesConflict(`A best-of-${match.best_of} result needs ${requiredWins} game win${requiredWins === 1 ? "" : "s"} to clinch.`);
  const winnerEntryId = winsA > winsB ? match.participant_a_entry_id : match.participant_b_entry_id;
  return { sorted, winsA, winsB, winnerEntryId };
}

async function notifyOpponents(eventId: string, userIds: string[], title: string, message: string) {
  await Promise.allSettled([...new Set(userIds)].map((userId) => getPool().execute(
    `INSERT INTO notifications (id, user_id, event_id, notification_type, category, title, message, action_url)
     VALUES (?, ?, ?, 'MATCH_UPDATE', 'EVENTS', ?, ?, ?)`,
    [randomUUID(), userId, eventId, title, message, `/dashboard/events/${eventId}/matches`],
  )));
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid series result." }, { status: 400 });
  const { eventId } = await context.params;
  const access = await getTournamentAccess(session.userId, eventId);
  if (!access.event || !access.event.bracket_enabled) return NextResponse.json({ error: "Tournament event not found." }, { status: 404 });
  if (access.event.status !== "LIVE") return NextResponse.json({ error: "The event must be live before a series result can be submitted." }, { status: 409 });

  try {
    const outcome = await withTransaction(async (connection) => {
      const [brackets] = await connection.query<BracketRow[]>(`SELECT id, status FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`, [eventId]);
      const bracket = brackets[0];
      if (!bracket || bracket.status !== "LIVE") throw new SeriesConflict("Publish the competition live before reporting a series.");
      const [matches] = await connection.query<MatchRow[]>(
        `SELECT bm.id, bm.bracket_id, bm.round_number, bm.match_number, bm.stage_label, bm.status, bm.best_of,
                bm.participant_a_entry_id, bm.participant_b_entry_id,
                CAST(a.user_id AS CHAR) AS a_user_id, CAST(b.user_id AS CHAR) AS b_user_id,
                a.team_id AS a_team_id, b.team_id AS b_team_id,
                a.display_name AS a_name, b.display_name AS b_name
         FROM bracket_matches bm
         INNER JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
         INNER JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
         WHERE bm.id = ? AND bm.bracket_id = ? LIMIT 1 FOR UPDATE`,
        [parsed.data.matchId, bracket.id],
      );
      const match = matches[0];
      if (!match) throw new SeriesConflict("Match not found in this event competition.");
      if (match.status !== "LIVE") throw new SeriesConflict("Start the match before submitting the series result.");

      const users = await loadEntryUsers(connection, eventId, match);
      const side = participantSide(users, session.userId);
      if (!side) throw new SeriesConflict("Only a linked player or snapshotted team member can submit this series result.");
      const [settingsRows] = await connection.query<SettingsRow[]>(`SELECT confirmation_minutes, paused_at FROM tournament_settings WHERE event_id = ? LIMIT 1`, [eventId]);
      const settings = settingsRows[0] ?? { confirmation_minutes: 30, paused_at: null };
      if (settings.paused_at) throw new SeriesConflict("Tournament operations are paused by the host.");

      const validated = validateSeries(match, parsed.data.games);
      const [existing] = await connection.query<(RowDataPacket & { id: string })[]>(
        `SELECT id FROM match_reports WHERE match_id = ? AND status IN ('PENDING', 'DISPUTED') LIMIT 1 FOR UPDATE`,
        [match.id],
      );
      if (existing[0]) throw new SeriesConflict("A result is already waiting for confirmation or dispute resolution.");

      const reportId = randomUUID();
      const due = new Date(Date.now() + settings.confirmation_minutes * 60_000);
      const storedGames = validated.sorted.map((game) => ({
        gameNumber: game.gameNumber,
        mapName: game.mapName,
        modeName: game.modeName || null,
        winnerEntryId: game.winnerEntryId,
        scoreA: game.scoreA ?? null,
        scoreB: game.scoreB ?? null,
      }));
      await connection.execute(
        `INSERT INTO match_reports
          (id, match_id, winner_entry_id, score_a, score_b, game_results_json, proof_url, notes, status, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [reportId, match.id, validated.winnerEntryId, validated.winsA, validated.winsB, JSON.stringify(storedGames), parsed.data.proofUrl || null, parsed.data.notes || null, session.userId],
      );
      await connection.execute(
        `UPDATE bracket_matches SET status = 'AWAITING_CONFIRMATION', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP(3),
           confirmation_due_at = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [session.userId, due, match.id],
      );
      const opponents = side === "A" ? [...users.b] : [...users.a];
      return {
        reportId,
        opponents,
        label: `${match.stage_label ?? `Round ${match.round_number}`} · Match ${match.match_number}`,
        score: `${validated.winsA}-${validated.winsB}`,
        winnerEntryId: validated.winnerEntryId,
      };
    });

    await writeAuditLog({
      actorUserId: session.userId,
      workspaceId: access.event.workspace_id,
      eventId,
      action: "match.report_series",
      targetType: "bracket_match",
      targetId: parsed.data.matchId,
      details: { reportId: outcome.reportId, games: parsed.data.games.length, winnerEntryId: outcome.winnerEntryId, seriesScore: outcome.score },
    });
    await notifyOpponents(eventId, outcome.opponents.filter((userId) => userId !== session.userId), `${access.event.name} · series result`, `${outcome.label} has a ${outcome.score} series result waiting for confirmation.`);
    return NextResponse.json({ success: true, reportId: outcome.reportId, score: outcome.score });
  } catch (error) {
    if (error instanceof SeriesConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
