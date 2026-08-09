import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import {
  bracketChampion,
  deriveExpandedCompetitionMatches,
  deriveSingleElimination,
  resolveThreePlayerAdvancement,
  type BracketDraft,
  type CompetitionStage,
  type Participant,
} from "@/components/bracket/bracket-model";

type ExistingEntryRow = RowDataPacket & {
  id: string;
  user_id: string | null;
  team_id: string | null;
  participant_key: string | null;
  display_name: string;
  slot_number: number;
};

type ExistingMatchRow = RowDataPacket & {
  id: string;
  round_number: number;
  match_number: number;
  participant_a_entry_id: string | null;
  participant_b_entry_id: string | null;
  participant_c_entry_id: string | null;
  winner_entry_id: string | null;
  status: "PENDING" | "READY" | "LIVE" | "AWAITING_CONFIRMATION" | "DISPUTED" | "COMPLETED" | "FORFEIT";
  result_json: string | null;
  scheduled_at: Date | null;
  best_of: number;
  ready_a_at: Date | null;
  ready_b_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  no_show_deadline_at: Date | null;
  submitted_by: string | null;
  submitted_at: Date | null;
  confirmation_due_at: Date | null;
  stage_key: string | null;
  stage_label: string | null;
  group_key: string | null;
  bracket_side: string | null;
  stage_round_number: number | null;
};

type NormalizedMatchInput = {
  globalRoundNumber: number;
  matchNumber: number;
  stageKey: string;
  stageLabel: string;
  bracketSide: "MAIN" | "WINNERS" | "LOSERS" | "GROUP" | "PLAYOFF" | "FINALS";
  stageRoundNumber: number;
  groupKey?: string | null;
  sourceMatchId: string;
  a: Participant | null;
  b: Participant | null;
  c?: Participant | null;
  winner: Participant | null;
  active: boolean;
  extraResult?: Record<string, unknown>;
};

function linkedUserId(participant: Participant): string | null {
  if (participant.entrantType === "team") return null;
  const match = /^user-(\d+)$/.exec(participant.id);
  return match?.[1] ?? null;
}

function linkedTeamId(participant: Participant): string | null {
  if (participant.teamId) return participant.teamId;
  const match = /^team-([0-9a-f-]{36})$/i.exec(participant.id);
  return match?.[1] ?? null;
}

function sourceMatchIdFromJson(value: string | null): string | null {
  try {
    const parsed = JSON.parse(value ?? "{}") as { sourceMatchId?: unknown };
    return typeof parsed.sourceMatchId === "string" ? parsed.sourceMatchId : null;
  } catch {
    return null;
  }
}

function parseExistingResult(value: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function bracketSideForStage(stage: CompetitionStage): NormalizedMatchInput["bracketSide"] {
  if (stage === "winners") return "WINNERS";
  if (stage === "losers") return "LOSERS";
  if (stage === "group" || stage === "round_robin") return "GROUP";
  if (stage === "playoff") return "PLAYOFF";
  if (stage === "grand_final") return "FINALS";
  return "MAIN";
}

async function resetMatchWorkflow(connection: PoolConnection, matchId: string, destructive: boolean): Promise<void> {
  if (destructive) {
    await connection.execute(`DELETE FROM match_disputes WHERE match_id = ?`, [matchId]);
    await connection.execute(`DELETE FROM match_reports WHERE match_id = ?`, [matchId]);
    return;
  }
  await connection.execute(
    `UPDATE match_reports SET status = 'VOID', updated_at = CURRENT_TIMESTAMP(3)
     WHERE match_id = ? AND status <> 'VOID'`,
    [matchId],
  );
  await connection.execute(
    `UPDATE match_disputes
     SET status = 'RESOLVED', resolution_action = 'VOID_REPORT',
         resolution_note = 'Competition result changed before or through tournament correction.',
         resolved_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
     WHERE match_id = ? AND status = 'OPEN'`,
    [matchId],
  );
}

function buildNormalizedMatches(draft: BracketDraft): NormalizedMatchInput[] {
  if (draft.format === "single") {
    return deriveSingleElimination(draft.firstRound, draft.winners).flatMap((round) => round.map((match) => ({
      globalRoundNumber: match.round + 1,
      matchNumber: match.index + 1,
      stageKey: "main",
      stageLabel: match.round === deriveSingleElimination(draft.firstRound, draft.winners).length - 1 ? "Final" : `Round ${match.round + 1}`,
      bracketSide: "MAIN" as const,
      stageRoundNumber: match.round + 1,
      sourceMatchId: match.id,
      a: match.a,
      b: match.b,
      winner: match.winner,
      active: true,
      extraResult: { automaticBye: Boolean(match.winner && (!match.a || !match.b)) },
    })));
  }

  if (draft.format === "three") {
    const result = resolveThreePlayerAdvancement(draft.participants, draft.threeWinners);
    return [
      { order: 1, a: result.playerA, b: result.playerB, winner: result.m1Winner },
      { order: 2, a: result.playerC, b: result.m1Loser, winner: result.m2Winner },
      { order: 3, a: result.playerC, b: result.m1Winner, winner: result.m3Winner },
    ].map((match) => ({
      globalRoundNumber: match.order,
      matchNumber: 1,
      stageKey: "three",
      stageLabel: `Match ${match.order}`,
      bracketSide: "MAIN" as const,
      stageRoundNumber: match.order,
      sourceMatchId: `m${match.order}`,
      a: match.a,
      b: match.b,
      winner: match.winner,
      active: true,
      extraResult: { advancingParticipantId: match.order === 3 ? result.champion?.id ?? null : null },
    }));
  }

  const resolved = deriveExpandedCompetitionMatches(draft);
  const stageRounds = new Map<string, number>();
  let globalRoundCounter = 0;
  return resolved.map((match) => {
    const stageRoundKey = `${match.stage}:${match.group ?? ""}:${match.round}`;
    let globalRoundNumber = stageRounds.get(stageRoundKey);
    if (!globalRoundNumber) {
      globalRoundCounter += 1;
      globalRoundNumber = globalRoundCounter;
      stageRounds.set(stageRoundKey, globalRoundNumber);
    }
    return {
      globalRoundNumber,
      matchNumber: match.index + 1,
      stageKey: match.stage,
      stageLabel: match.label,
      bracketSide: bracketSideForStage(match.stage),
      stageRoundNumber: match.round,
      groupKey: match.group ?? null,
      sourceMatchId: match.id,
      a: match.a,
      b: match.b,
      winner: match.winner,
      active: match.active,
      extraResult: {
        format: draft.format,
        stage: match.stage,
        group: match.group ?? null,
        conditionalInactive: !match.active,
        automaticBye: Boolean(match.active && match.winner && (!match.a || !match.b)),
      },
    };
  });
}

export async function syncBracketRecords(connection: PoolConnection, bracketId: string, draft: BracketDraft): Promise<void> {
  const [existingEntries] = await connection.query<ExistingEntryRow[]>(
    `SELECT id, CAST(user_id AS CHAR) AS user_id, team_id, participant_key, display_name, slot_number
     FROM bracket_entries WHERE bracket_id = ?`,
    [bracketId],
  );
  const [existingMatches] = await connection.query<ExistingMatchRow[]>(
    `SELECT id, round_number, match_number, participant_a_entry_id, participant_b_entry_id,
            participant_c_entry_id, winner_entry_id, status, result_json, scheduled_at, best_of,
            ready_a_at, ready_b_at, started_at, completed_at, no_show_deadline_at,
            CAST(submitted_by AS CHAR) AS submitted_by, submitted_at, confirmation_due_at,
            stage_key, stage_label, group_key, bracket_side, stage_round_number
     FROM bracket_matches WHERE bracket_id = ?`,
    [bracketId],
  );

  const champion = bracketChampion(draft);
  const eliminated = new Set<string>();
  if (draft.format === "single") {
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    for (const match of rounds.flat()) {
      if (!match.winner || !match.a || !match.b) continue;
      eliminated.add(match.winner.id === match.a.id ? match.b.id : match.a.id);
    }
  } else if (draft.format === "three" && champion) {
    for (const participant of draft.participants) if (participant.id !== champion.id) eliminated.add(participant.id);
  } else if (champion) {
    for (const participant of draft.participants) if (participant.id !== champion.id) eliminated.add(participant.id);
  }

  const byParticipantKey = new Map(existingEntries.filter((entry) => entry.participant_key).map((entry) => [entry.participant_key as string, entry]));
  const byUserId = new Map(existingEntries.filter((entry) => entry.user_id).map((entry) => [entry.user_id as string, entry]));
  const byTeamId = new Map(existingEntries.filter((entry) => entry.team_id).map((entry) => [entry.team_id as string, entry]));
  const usedEntryIds = new Set<string>();
  const entryIds = new Map<string, string>();

  if (existingEntries.length) {
    await connection.execute(`UPDATE bracket_entries SET slot_number = slot_number + 100000 WHERE bracket_id = ?`, [bracketId]);
  }

  for (const [index, participant] of draft.participants.entries()) {
    const userId = linkedUserId(participant);
    const teamId = linkedTeamId(participant);
    let existing = byParticipantKey.get(participant.id)
      ?? (userId ? byUserId.get(userId) : undefined)
      ?? (teamId ? byTeamId.get(teamId) : undefined);
    if (!existing) existing = existingEntries.find((entry) => !usedEntryIds.has(entry.id) && entry.display_name === participant.name);

    const entryId = existing?.id ?? randomUUID();
    usedEntryIds.add(entryId);
    entryIds.set(participant.id, entryId);
    const status = champion?.id === participant.id ? "ADVANCED" : eliminated.has(participant.id) ? "ELIMINATED" : "ACTIVE";

    if (existing) {
      await connection.execute(
        `UPDATE bracket_entries
         SET user_id = ?, team_id = ?, participant_key = ?, display_name = ?, seed_number = ?, slot_number = ?, status = ?
         WHERE id = ?`,
        [userId, teamId, participant.id, participant.name, index + 1, index + 1, status, entryId],
      );
    } else {
      await connection.execute(
        `INSERT INTO bracket_entries
          (id, bracket_id, user_id, team_id, participant_key, display_name, seed_number, slot_number, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entryId, bracketId, userId, teamId, participant.id, participant.name, index + 1, index + 1, status],
      );
    }
  }

  const existingMatchBySource = new Map<string, ExistingMatchRow>();
  const existingMatchByPosition = new Map(existingMatches.map((match) => [`${match.round_number}:${match.match_number}`, match]));
  for (const match of existingMatches) {
    const source = sourceMatchIdFromJson(match.result_json);
    if (source) existingMatchBySource.set(source, match);
  }
  const usedMatchIds = new Set<string>();
  const normalizedMatches = buildNormalizedMatches(draft);

  for (const input of normalizedMatches) {
    const positionKey = `${input.globalRoundNumber}:${input.matchNumber}`;
    const existing = existingMatchBySource.get(input.sourceMatchId) ?? existingMatchByPosition.get(positionKey);
    const matchId = existing?.id ?? randomUUID();
    usedMatchIds.add(matchId);

    const aId = input.a ? entryIds.get(input.a.id) ?? null : null;
    const bId = input.b ? entryIds.get(input.b.id) ?? null : null;
    const cId = input.c ? entryIds.get(input.c.id) ?? null : null;
    const winnerId = input.winner ? entryIds.get(input.winner.id) ?? null : null;
    const participantsChanged = Boolean(existing && (
      existing.participant_a_entry_id !== aId
      || existing.participant_b_entry_id !== bId
      || existing.participant_c_entry_id !== cId
    ));
    const resultChanged = Boolean(existing && existing.winner_entry_id !== winnerId);

    if (existing && (participantsChanged || resultChanged)) {
      await resetMatchWorkflow(connection, existing.id, participantsChanged);
    }

    let status: ExistingMatchRow["status"] = input.winner ? "COMPLETED" : "PENDING";
    if (!input.active) status = "PENDING";
    if (
      existing
      && input.active
      && !participantsChanged
      && !input.winner
      && ["READY", "LIVE", "AWAITING_CONFIRMATION", "DISPUTED"].includes(existing.status)
    ) status = existing.status;
    if (existing && input.winner && existing.winner_entry_id === winnerId && existing.status === "FORFEIT") status = "FORFEIT";

    const preserveWorkflow = Boolean(existing && !participantsChanged && !resultChanged);
    const previousResult = parseExistingResult(existing?.result_json ?? null);
    const resultJson = JSON.stringify({
      ...previousResult,
      sourceMatchId: input.sourceMatchId,
      ...(input.extraResult ?? {}),
    });

    if (existing) {
      await connection.execute(
        `UPDATE bracket_matches
         SET round_number = ?, match_number = ?, stage_key = ?, stage_label = ?, group_key = ?, bracket_side = ?, stage_round_number = ?,
             participant_a_entry_id = ?, participant_b_entry_id = ?, participant_c_entry_id = ?,
             winner_entry_id = ?, status = ?, result_json = ?,
             ready_a_at = ?, ready_b_at = ?, started_at = ?,
             completed_at = CASE WHEN ? IN ('COMPLETED', 'FORFEIT') THEN COALESCE(completed_at, CURRENT_TIMESTAMP(3)) ELSE NULL END,
             submitted_by = ?, submitted_at = ?, confirmation_due_at = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
          input.globalRoundNumber, input.matchNumber, input.stageKey, input.stageLabel, input.groupKey ?? null, input.bracketSide, input.stageRoundNumber,
          aId, bId, cId, winnerId, status, resultJson,
          preserveWorkflow ? existing.ready_a_at : null,
          preserveWorkflow ? existing.ready_b_at : null,
          preserveWorkflow && ["LIVE", "AWAITING_CONFIRMATION", "DISPUTED", "COMPLETED", "FORFEIT"].includes(status) ? existing.started_at : null,
          status,
          preserveWorkflow ? existing.submitted_by : null,
          preserveWorkflow ? existing.submitted_at : null,
          preserveWorkflow ? existing.confirmation_due_at : null,
          existing.id,
        ],
      );
    } else {
      await connection.execute(
        `INSERT INTO bracket_matches
          (id, bracket_id, round_number, match_number, stage_key, stage_label, group_key, bracket_side, stage_round_number,
           participant_a_entry_id, participant_b_entry_id, participant_c_entry_id, winner_entry_id, status, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          matchId, bracketId, input.globalRoundNumber, input.matchNumber, input.stageKey, input.stageLabel, input.groupKey ?? null,
          input.bracketSide, input.stageRoundNumber, aId, bId, cId, winnerId, status, resultJson,
        ],
      );
    }
  }

  const staleMatchIds = existingMatches.filter((match) => !usedMatchIds.has(match.id)).map((match) => match.id);
  if (staleMatchIds.length) {
    const placeholders = staleMatchIds.map(() => "?").join(",");
    await connection.execute(`DELETE FROM bracket_matches WHERE id IN (${placeholders})`, staleMatchIds);
  }

  const staleEntryIds = existingEntries.filter((entry) => !usedEntryIds.has(entry.id)).map((entry) => entry.id);
  if (staleEntryIds.length) {
    const placeholders = staleEntryIds.map(() => "?").join(",");
    await connection.execute(`DELETE FROM bracket_entries WHERE id IN (${placeholders})`, staleEntryIds);
  }
}
