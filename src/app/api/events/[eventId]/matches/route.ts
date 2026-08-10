import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { isDraft, type BracketDraft } from "@/components/bracket/bracket-model";
import { applyDraftWinner, clearDraftWinner, getDraftMatchParticipants } from "@/lib/bracket-results";
import { syncBracketRecords } from "@/lib/bracket-normalization";
import { getTournamentAccess } from "@/lib/tournament-access";
import { dispatchWorkspaceWebhooks } from "@/lib/workspace-webhook-dispatch";

const actionSchema = z.object({
  action: z.enum(["READY", "START", "SCHEDULE", "REPORT", "CONFIRM", "DISPUTE", "OVERRIDE", "FORFEIT", "RESET"]),
  matchId: z.string().uuid(),
  winnerEntryId: z.string().uuid().optional(),
  scoreA: z.number().int().min(0).max(999).nullable().optional(),
  scoreB: z.number().int().min(0).max(999).nullable().optional(),
  proofUrl: z.string().trim().url().max(1000).or(z.literal("")).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  reason: z.string().trim().max(2000).optional().default(""),
  scheduledAt: z.string().datetime().nullable().optional(),
  bestOf: z.number().int().min(1).max(9).optional(),
});

type BracketRow = RowDataPacket & {
  id: string;
  status: "DRAFT" | "GENERATED" | "LIVE" | "COMPLETED";
  settings_json: string | null;
};

type MatchRow = RowDataPacket & {
  id: string;
  bracket_id: string;
  round_number: number;
  match_number: number;
  stage_label: string | null;
  group_key: string | null;
  participant_a_entry_id: string | null;
  participant_b_entry_id: string | null;
  winner_entry_id: string | null;
  status: "PENDING" | "READY" | "LIVE" | "AWAITING_CONFIRMATION" | "DISPUTED" | "COMPLETED" | "FORFEIT";
  result_json: string | null;
  scheduled_at: Date | null;
  best_of: number;
  ready_a_at: Date | null;
  ready_b_at: Date | null;
  no_show_deadline_at: Date | null;
  a_user_id: string | null;
  b_user_id: string | null;
  a_team_id: string | null;
  b_team_id: string | null;
  a_participant_key: string | null;
  b_participant_key: string | null;
  a_name: string | null;
  b_name: string | null;
};

type SettingsRow = RowDataPacket & { no_show_minutes: number; confirmation_minutes: number; paused_at: Date | null };
type ReportRow = RowDataPacket & { id: string; submitted_by: string; winner_entry_id: string; status: string };
type TeamSnapshotRow = RowDataPacket & { team_id: string; roster_json: string | null };
type EntryUsers = { a: Set<string>; b: Set<string> };
type MatchOutcome = { action: string; label: string; participantUsers: string[]; message: string; webhook: boolean };

class MatchConflict extends Error {}

function sourceMatchId(match: MatchRow): string | null {
  try {
    const value = JSON.parse(match.result_json ?? "{}") as { sourceMatchId?: unknown };
    return typeof value.sourceMatchId === "string" ? value.sourceMatchId : null;
  } catch { return null; }
}

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

function participantEntryForUser(match: MatchRow, users: EntryUsers, userId: string): string | null {
  const inA = users.a.has(userId);
  const inB = users.b.has(userId);
  if (inA && inB) throw new MatchConflict("Your account is listed on both sides of this match. Tournament staff must correct the team rosters before player actions can continue.");
  if (inA) return match.participant_a_entry_id;
  if (inB) return match.participant_b_entry_id;
  return null;
}

function allParticipantUsers(users: EntryUsers): string[] {
  return [...new Set([...users.a, ...users.b])];
}

function participantKeyForEntry(match: MatchRow, entryId: string): string | null {
  if (match.participant_a_entry_id === entryId) return match.a_participant_key;
  if (match.participant_b_entry_id === entryId) return match.b_participant_key;
  return null;
}

function participantNameForEntry(match: MatchRow, entryId: string): string | null {
  if (match.participant_a_entry_id === entryId) return match.a_name;
  if (match.participant_b_entry_id === entryId) return match.b_name;
  return null;
}

function validateWinner(match: MatchRow, winnerEntryId: string | undefined): string {
  if (!winnerEntryId || ![match.participant_a_entry_id, match.participant_b_entry_id].includes(winnerEntryId)) {
    throw new MatchConflict("Choose an entrant who is actually in this match.");
  }
  return winnerEntryId;
}

function validateScore(match: MatchRow, winnerEntryId: string, scoreA: number | null | undefined, scoreB: number | null | undefined): void {
  if (scoreA == null && scoreB == null) return;
  if (scoreA == null || scoreB == null) throw new MatchConflict("Enter both scores or leave both blank.");
  if (scoreA === scoreB) throw new MatchConflict("A completed match cannot end in a tied score.");
  if (winnerEntryId === match.participant_a_entry_id && scoreA <= scoreB) throw new MatchConflict("The selected winner must have the higher score.");
  if (winnerEntryId === match.participant_b_entry_id && scoreB <= scoreA) throw new MatchConflict("The selected winner must have the higher score.");
}

async function loadLockedMatch(connection: PoolConnection, bracketId: string, matchId: string): Promise<MatchRow> {
  const [rows] = await connection.query<MatchRow[]>(
    `SELECT bm.id, bm.bracket_id, bm.round_number, bm.match_number, bm.stage_label, bm.group_key,
            bm.participant_a_entry_id, bm.participant_b_entry_id, bm.winner_entry_id,
            bm.status, bm.result_json, bm.scheduled_at, bm.best_of, bm.ready_a_at, bm.ready_b_at,
            bm.no_show_deadline_at,
            CAST(a.user_id AS CHAR) AS a_user_id, CAST(b.user_id AS CHAR) AS b_user_id,
            a.team_id AS a_team_id, b.team_id AS b_team_id,
            a.participant_key AS a_participant_key, b.participant_key AS b_participant_key,
            a.display_name AS a_name, b.display_name AS b_name
     FROM bracket_matches bm
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     WHERE bm.id = ? AND bm.bracket_id = ? LIMIT 1 FOR UPDATE`,
    [matchId, bracketId],
  );
  if (!rows[0]) throw new MatchConflict("Match not found in this event competition.");
  return rows[0];
}

async function resolveWinnerParticipantKey(input: {
  connection: PoolConnection;
  draft: BracketDraft;
  match: MatchRow;
  sourceId: string;
  winnerEntryId: string;
}): Promise<string> {
  const stored = participantKeyForEntry(input.match, input.winnerEntryId);
  if (stored) return stored;
  const displayName = participantNameForEntry(input.match, input.winnerEntryId)?.trim();
  if (!displayName) throw new MatchConflict("This legacy competition entry is missing its saved participant identity. Re-save the competition before continuing.");
  const normalized = displayName.toLocaleLowerCase();
  const candidates = getDraftMatchParticipants(input.draft, input.sourceId).filter((participant) => participant.name.trim().toLocaleLowerCase() === normalized);
  if (candidates.length !== 1) throw new MatchConflict("This legacy manual competition cannot map that entrant safely because the saved names are ambiguous. Re-save the competition once before operating this match.");
  const participantKey = candidates[0].id;
  await input.connection.execute(`UPDATE bracket_entries SET participant_key = ? WHERE id = ? AND participant_key IS NULL`, [participantKey, input.winnerEntryId]);
  return participantKey;
}

async function completeMatch(input: {
  connection: PoolConnection;
  bracket: BracketRow;
  match: MatchRow;
  winnerEntryId: string;
  actorUserId: string;
  reportId: string;
  finalStatus: "COMPLETED" | "FORFEIT";
  scoreA?: number | null;
  scoreB?: number | null;
  reason?: string;
}): Promise<BracketDraft> {
  if (!input.bracket.settings_json) throw new MatchConflict("The saved competition state is missing.");
  let draft: unknown;
  try { draft = JSON.parse(input.bracket.settings_json); } catch { draft = null; }
  if (!isDraft(draft)) throw new MatchConflict("The saved competition state is invalid.");
  const sourceId = sourceMatchId(input.match);
  if (!sourceId) throw new MatchConflict("This match is not linked to a valid competition slot.");
  const winnerKey = await resolveWinnerParticipantKey({ connection: input.connection, draft, match: input.match, sourceId, winnerEntryId: input.winnerEntryId });

  const nextDraft = applyDraftWinner(draft, sourceId, winnerKey);
  await input.connection.execute(
    `UPDATE bracket_matches
     SET winner_entry_id = ?, status = ?, completed_at = CURRENT_TIMESTAMP(3),
         decided_by = ?, confirmation_due_at = NULL,
         result_json = JSON_SET(COALESCE(result_json, '{}'), '$.scoreA', ?, '$.scoreB', ?, '$.decisionReason', ?),
         updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [input.winnerEntryId, input.finalStatus, input.actorUserId, input.scoreA ?? null, input.scoreB ?? null, input.reason ?? null, input.match.id],
  );
  await input.connection.execute(
    `UPDATE match_reports SET status = CASE WHEN id = ? THEN status ELSE 'VOID' END, updated_at = CURRENT_TIMESTAMP(3)
     WHERE match_id = ? AND status <> 'VOID'`,
    [input.reportId, input.match.id],
  );
  await input.connection.execute(`UPDATE brackets SET settings_json = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [JSON.stringify(nextDraft), input.bracket.id]);
  await syncBracketRecords(input.connection, input.bracket.id, nextDraft);
  return nextDraft;
}

async function notifyUsers(eventId: string, userIds: string[], title: string, message: string): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.allSettled(unique.map((userId) => getPool().execute(
    `INSERT INTO notifications (id, user_id, event_id, notification_type, category, title, message, action_url)
     VALUES (?, ?, ?, 'MATCH_UPDATE', 'EVENTS', ?, ?, ?)`,
    [randomUUID(), userId, eventId, title, message, `/dashboard/events/${eventId}/matches`],
  )));
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid match action." }, { status: 400 });
  const { eventId } = await context.params;
  const access = await getTournamentAccess(session.userId, eventId);
  if (!access.event || !access.event.bracket_enabled) return NextResponse.json({ error: "Tournament event not found." }, { status: 404 });

  const action = parsed.data.action;
  const managerOnly = ["SCHEDULE", "OVERRIDE", "FORFEIT", "RESET"].includes(action);
  if (managerOnly && !access.manager) return NextResponse.json({ error: "Tournament manager permission is required." }, { status: 403 });

  try {
    const outcome = await withTransaction(async (connection) => {
      const [bracketRows] = await connection.query<BracketRow[]>(`SELECT id, status, settings_json FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`, [eventId]);
      const bracket = bracketRows[0];
      if (!bracket) throw new MatchConflict("Generate and save the event competition first.");
      if (bracket.status === "COMPLETED" && action !== "RESET") throw new MatchConflict("Reopen the completed competition before changing match operations.");
      if (!["SCHEDULE", "RESET"].includes(action) && bracket.status !== "LIVE") throw new MatchConflict("Publish the competition live before operating matches.");

      const match = await loadLockedMatch(connection, bracket.id, parsed.data.matchId);
      if (!match.participant_a_entry_id || !match.participant_b_entry_id) throw new MatchConflict("Both match entrants must be known before this action.");
      const entryUsers = await loadEntryUsers(connection, eventId, match);
      const playerEntryId = participantEntryForUser(match, entryUsers, session.userId);
      if (!access.manager && !playerEntryId) throw new MatchConflict("You are not a participant in this match.");

      const [settingsRows] = await connection.query<SettingsRow[]>(`SELECT no_show_minutes, confirmation_minutes, paused_at FROM tournament_settings WHERE event_id = ? LIMIT 1`, [eventId]);
      const settings = settingsRows[0] ?? { no_show_minutes: 15, confirmation_minutes: 30, paused_at: null };
      if (settings.paused_at && !access.manager) throw new MatchConflict("Tournament operations are paused by the host.");

      const participantUsers = allParticipantUsers(entryUsers);
      const label = `${match.stage_label ?? `Round ${match.round_number}`} · Match ${match.match_number}`;
      const audited = async (value: MatchOutcome): Promise<MatchOutcome> => {
        await writeAuditLog({
          actorUserId: session.userId,
          workspaceId: access.event!.workspace_id,
          eventId,
          action: `match.${value.action.toLowerCase()}`,
          targetType: "bracket_match",
          targetId: match.id,
          details: { reason: parsed.data.reason || null, winnerEntryId: parsed.data.winnerEntryId ?? null },
        }, connection);
        return value;
      };

      if (action === "READY") {
        if (!playerEntryId) throw new MatchConflict("Only a linked match participant can mark ready.");
        if (!["PENDING", "READY"].includes(match.status)) throw new MatchConflict("This match is no longer waiting for ready checks.");
        const side = playerEntryId === match.participant_a_entry_id ? "a" : "b";
        await connection.execute(
          side === "a"
            ? `UPDATE bracket_matches SET ready_a_at = COALESCE(ready_a_at, CURRENT_TIMESTAMP(3)), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`
            : `UPDATE bracket_matches SET ready_b_at = COALESCE(ready_b_at, CURRENT_TIMESTAMP(3)), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [match.id],
        );
        const [readyRows] = await connection.query<(RowDataPacket & { ready_a_at: Date | null; ready_b_at: Date | null })[]>(`SELECT ready_a_at, ready_b_at FROM bracket_matches WHERE id = ? LIMIT 1`, [match.id]);
        const bothReady = Boolean(readyRows[0]?.ready_a_at && readyRows[0]?.ready_b_at);
        if (bothReady) await connection.execute(`UPDATE bracket_matches SET status = 'READY', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [match.id]);
        return audited({ action, label, participantUsers, message: bothReady ? `${label} is ready to begin.` : `${label} received a ready check.`, webhook: bothReady });
      }

      if (action === "START") {
        if (!["PENDING", "READY"].includes(match.status)) throw new MatchConflict("This match cannot be started from its current state.");
        if (!access.manager && !(match.ready_a_at && match.ready_b_at)) throw new MatchConflict("Both sides must mark ready before starting the match.");
        await connection.execute(`UPDATE bracket_matches SET status = 'LIVE', started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3)), no_show_deadline_at = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [match.id]);
        return audited({ action, label, participantUsers, message: `${label} is now live.`, webhook: true });
      }

      if (action === "SCHEDULE") {
        const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
        if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new MatchConflict("Choose a valid match time.");
        const bestOf = parsed.data.bestOf ?? match.best_of ?? 1;
        if (![1, 3, 5, 7, 9].includes(bestOf)) throw new MatchConflict("Best-of must be 1, 3, 5, 7, or 9.");
        const noShowDeadline = scheduledAt ? new Date(scheduledAt.getTime() + settings.no_show_minutes * 60_000) : null;
        await connection.execute(`UPDATE bracket_matches SET scheduled_at = ?, best_of = ?, no_show_deadline_at = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [scheduledAt, bestOf, noShowDeadline, match.id]);
        return audited({ action, label, participantUsers, message: scheduledAt ? `${label} was scheduled for ${scheduledAt.toISOString()}.` : `${label} schedule was cleared.`, webhook: Boolean(scheduledAt) });
      }

      if (action === "REPORT") {
        if (!playerEntryId) throw new MatchConflict("Only a linked match participant can submit a result.");
        if (match.status !== "LIVE") throw new MatchConflict("Start the match before submitting a result.");
        const winnerEntryId = validateWinner(match, parsed.data.winnerEntryId);
        validateScore(match, winnerEntryId, parsed.data.scoreA, parsed.data.scoreB);
        const [existing] = await connection.query<(RowDataPacket & { id: string })[]>(`SELECT id FROM match_reports WHERE match_id = ? AND status IN ('PENDING', 'DISPUTED') LIMIT 1 FOR UPDATE`, [match.id]);
        if (existing[0]) throw new MatchConflict("A result is already waiting for confirmation or dispute resolution.");
        const reportId = randomUUID();
        const due = new Date(Date.now() + settings.confirmation_minutes * 60_000);
        await connection.execute(
          `INSERT INTO match_reports (id, match_id, winner_entry_id, score_a, score_b, proof_url, notes, status, submitted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [reportId, match.id, winnerEntryId, parsed.data.scoreA ?? null, parsed.data.scoreB ?? null, parsed.data.proofUrl || null, parsed.data.notes || null, session.userId],
        );
        await connection.execute(`UPDATE bracket_matches SET status = 'AWAITING_CONFIRMATION', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP(3), confirmation_due_at = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [session.userId, due, match.id]);
        const reporterSide = playerEntryId === match.participant_a_entry_id ? entryUsers.a : entryUsers.b;
        return audited({ action, label, participantUsers: participantUsers.filter((userId) => !reporterSide.has(userId)), message: `${label} has a result waiting for confirmation.`, webhook: false });
      }

      if (action === "CONFIRM") {
        if (!playerEntryId && !access.manager) throw new MatchConflict("Only the opposing entrant or tournament staff can confirm this result.");
        const [reports] = await connection.query<ReportRow[]>(
          `SELECT id, CAST(submitted_by AS CHAR) AS submitted_by, winner_entry_id, status
           FROM match_reports WHERE match_id = ? AND status IN ('PENDING', 'DISPUTED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [match.id],
        );
        const report = reports[0];
        if (!report) throw new MatchConflict("There is no result waiting for confirmation.");
        const submitterEntryId = participantEntryForUser(match, entryUsers, report.submitted_by);
        if (report.submitted_by === session.userId || (playerEntryId && submitterEntryId === playerEntryId)) {
          throw new MatchConflict("The entrant that submitted the result cannot confirm its own report. Tournament staff must use the override path with a reason if a correction is required.");
        }
        await connection.execute(`UPDATE match_reports SET status = 'CONFIRMED', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [session.userId, report.id]);
        await connection.execute(
          `UPDATE match_disputes SET status = 'RESOLVED', resolved_by = ?, resolution_action = 'CONFIRM_REPORT',
             resolution_note = 'Reported result confirmed.', resolved_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
           WHERE match_id = ? AND status = 'OPEN'`,
          [session.userId, match.id],
        );
        const [scoreRows] = await connection.query<(RowDataPacket & { score_a: number | null; score_b: number | null })[]>(`SELECT score_a, score_b FROM match_reports WHERE id = ? LIMIT 1`, [report.id]);
        await completeMatch({ connection, bracket, match, winnerEntryId: report.winner_entry_id, actorUserId: session.userId, reportId: report.id, finalStatus: "COMPLETED", scoreA: scoreRows[0]?.score_a, scoreB: scoreRows[0]?.score_b });
        return audited({ action, label, participantUsers, message: `${label} result was confirmed and the competition advanced.`, webhook: true });
      }

      if (action === "DISPUTE") {
        if (!playerEntryId) throw new MatchConflict("Only a linked match participant can dispute a result.");
        if (parsed.data.reason.length < 3) throw new MatchConflict("Explain why the reported result is being disputed.");
        const [reports] = await connection.query<ReportRow[]>(
          `SELECT id, CAST(submitted_by AS CHAR) AS submitted_by, winner_entry_id, status
           FROM match_reports WHERE match_id = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [match.id],
        );
        const report = reports[0];
        if (!report) throw new MatchConflict("There is no pending result to dispute.");
        const submitterEntryId = participantEntryForUser(match, entryUsers, report.submitted_by);
        if (report.submitted_by === session.userId || submitterEntryId === playerEntryId) throw new MatchConflict("Your side submitted this report. Tournament staff must handle a correction instead of opening a self-dispute.");
        await connection.execute(`UPDATE match_reports SET status = 'DISPUTED', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [report.id]);
        await connection.execute(`INSERT INTO match_disputes (id, match_id, report_id, opened_by, reason, proof_url) VALUES (?, ?, ?, ?, ?, ?)`, [randomUUID(), match.id, report.id, session.userId, parsed.data.reason, parsed.data.proofUrl || null]);
        await connection.execute(`UPDATE bracket_matches SET status = 'DISPUTED', updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [match.id]);
        return audited({ action, label, participantUsers, message: `${label} result was disputed and needs staff review.`, webhook: true });
      }

      if (action === "OVERRIDE" || action === "FORFEIT") {
        if (parsed.data.reason.length < 3) throw new MatchConflict("A staff reason is required for this decision.");
        const winnerEntryId = validateWinner(match, parsed.data.winnerEntryId);
        validateScore(match, winnerEntryId, parsed.data.scoreA, parsed.data.scoreB);
        const reportId = randomUUID();
        await connection.execute(
          `INSERT INTO match_reports (id, match_id, winner_entry_id, score_a, score_b, proof_url, notes, status, submitted_by, confirmed_by, confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'OVERRIDDEN', ?, ?, CURRENT_TIMESTAMP(3))`,
          [reportId, match.id, winnerEntryId, parsed.data.scoreA ?? null, parsed.data.scoreB ?? null, parsed.data.proofUrl || null, parsed.data.reason, session.userId, session.userId],
        );
        await connection.execute(
          `UPDATE match_disputes SET status = 'RESOLVED', resolved_by = ?, resolution_action = 'OVERRIDE_RESULT',
             resolution_note = ?, resolved_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
           WHERE match_id = ? AND status = 'OPEN'`,
          [session.userId, parsed.data.reason, match.id],
        );
        await completeMatch({ connection, bracket, match, winnerEntryId, actorUserId: session.userId, reportId, finalStatus: action === "FORFEIT" ? "FORFEIT" : "COMPLETED", scoreA: parsed.data.scoreA, scoreB: parsed.data.scoreB, reason: parsed.data.reason });
        return audited({ action, label, participantUsers, message: action === "FORFEIT" ? `${label} was decided by forfeit/no-show.` : `${label} result was decided by tournament staff.`, webhook: true });
      }

      if (action === "RESET") {
        if (!bracket.settings_json) throw new MatchConflict("The saved competition state is missing.");
        let draft: unknown;
        try { draft = JSON.parse(bracket.settings_json); } catch { draft = null; }
        if (!isDraft(draft)) throw new MatchConflict("The saved competition state is invalid.");
        const sourceId = sourceMatchId(match);
        if (!sourceId) throw new MatchConflict("This match is not linked to a competition slot.");
        const nextDraft = clearDraftWinner(draft, sourceId);
        await connection.execute(`UPDATE brackets SET settings_json = ?, completed_at = NULL, status = IF(status = 'COMPLETED', 'LIVE', status), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [JSON.stringify(nextDraft), bracket.id]);
        await syncBracketRecords(connection, bracket.id, nextDraft);
        await connection.execute(
          `UPDATE bracket_matches SET status = 'PENDING', winner_entry_id = NULL, ready_a_at = NULL, ready_b_at = NULL,
             started_at = NULL, completed_at = NULL, submitted_by = NULL, submitted_at = NULL,
             confirmation_due_at = NULL, decided_by = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [match.id],
        );
        return audited({ action, label, participantUsers, message: `${label} was reopened for correction.`, webhook: true });
      }

      throw new MatchConflict("Unsupported match action.");
    });

    await notifyUsers(eventId, outcome.participantUsers.filter((userId) => userId !== session.userId), `${access.event.name} · match update`, outcome.message);

    if (outcome.webhook) {
      const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
      await dispatchWorkspaceWebhooks({
        workspaceId: access.event.workspace_id,
        eventId,
        notificationType: "MATCH_UPDATE",
        title: `${access.event.name} · ${outcome.label}`,
        description: outcome.message,
        url: appUrl ? `${appUrl}/dashboard/events/${eventId}/matches` : null,
      });
    }
    return NextResponse.json({ success: true, action: outcome.action });
  } catch (error) {
    if (error instanceof MatchConflict || (error instanceof Error && error.message.includes("selected winner"))) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
