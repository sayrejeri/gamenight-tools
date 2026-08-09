import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import {
  bracketChampion,
  deriveSingleElimination,
  resolveThreePlayerAdvancement,
  type BracketDraft,
  type Participant,
} from "@/components/bracket/bracket-model";

type ExistingEntryRow = RowDataPacket & {
  id: string;
  user_id: string | null;
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
};

function linkedUserId(participant: Participant): string | null {
  const match = /^user-(\d+)$/.exec(participant.id);
  return match?.[1] ?? null;
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
         resolution_note = 'Bracket result changed outside the match workflow.',
         resolved_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
     WHERE match_id = ? AND status = 'OPEN'`,
    [matchId],
  );
}

export async function syncBracketRecords(connection: PoolConnection, bracketId: string, draft: BracketDraft): Promise<void> {
  const [existingEntries] = await connection.query<ExistingEntryRow[]>(
    `SELECT id, CAST(user_id AS CHAR) AS user_id, participant_key, display_name, slot_number
     FROM bracket_entries WHERE bracket_id = ?`,
    [bracketId],
  );
  const [existingMatches] = await connection.query<ExistingMatchRow[]>(
    `SELECT id, round_number, match_number, participant_a_entry_id, participant_b_entry_id,
            participant_c_entry_id, winner_entry_id, status, scheduled_at, best_of,
            ready_a_at, ready_b_at, started_at, completed_at, no_show_deadline_at,
            CAST(submitted_by AS CHAR) AS submitted_by, submitted_at, confirmation_due_at
     FROM bracket_matches WHERE bracket_id = ?`,
    [bracketId],
  );

  const champion = bracketChampion(draft);
  const eliminated = new Set<string>();

  if (draft.format === "single") {
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    for (const round of rounds) {
      for (const match of round) {
        if (!match.winner || !match.a || !match.b) continue;
        eliminated.add(match.winner.id === match.a.id ? match.b.id : match.a.id);
      }
    }
  } else if (champion) {
    for (const participant of draft.participants) {
      if (participant.id !== champion.id) eliminated.add(participant.id);
    }
  }

  const byParticipantKey = new Map(existingEntries.filter((entry) => entry.participant_key).map((entry) => [entry.participant_key as string, entry]));
  const byUserId = new Map(existingEntries.filter((entry) => entry.user_id).map((entry) => [entry.user_id as string, entry]));
  const usedEntryIds = new Set<string>();
  const entryIds = new Map<string, string>();

  if (existingEntries.length) {
    await connection.execute(`UPDATE bracket_entries SET slot_number = slot_number + 100000 WHERE bracket_id = ?`, [bracketId]);
  }

  for (const [index, participant] of draft.participants.entries()) {
    const userId = linkedUserId(participant);
    let existing = byParticipantKey.get(participant.id) ?? (userId ? byUserId.get(userId) : undefined);
    if (!existing) {
      existing = existingEntries.find((entry) => !usedEntryIds.has(entry.id) && entry.display_name === participant.name);
    }

    const entryId = existing?.id ?? randomUUID();
    usedEntryIds.add(entryId);
    entryIds.set(participant.id, entryId);
    const status = champion?.id === participant.id ? "ADVANCED" : eliminated.has(participant.id) ? "ELIMINATED" : "ACTIVE";

    if (existing) {
      await connection.execute(
        `UPDATE bracket_entries
         SET user_id = ?, participant_key = ?, display_name = ?, seed_number = ?, slot_number = ?, status = ?
         WHERE id = ?`,
        [userId, participant.id, participant.name, index + 1, index + 1, status, entryId],
      );
    } else {
      await connection.execute(
        `INSERT INTO bracket_entries
          (id, bracket_id, user_id, participant_key, display_name, seed_number, slot_number, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entryId, bracketId, userId, participant.id, participant.name, index + 1, index + 1, status],
      );
    }
  }

  const existingMatchByPosition = new Map(existingMatches.map((match) => [`${match.round_number}:${match.match_number}`, match]));
  const usedMatchIds = new Set<string>();

  async function upsertMatch(input: {
    roundNumber: number;
    matchNumber: number;
    sourceMatchId: string;
    a: Participant | null;
    b: Participant | null;
    c?: Participant | null;
    winner: Participant | null;
    ready: boolean;
    extraResult?: Record<string, unknown>;
  }) {
    const key = `${input.roundNumber}:${input.matchNumber}`;
    const existing = existingMatchByPosition.get(key);
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
    if (
      existing
      && !participantsChanged
      && !input.winner
      && ["READY", "LIVE", "AWAITING_CONFIRMATION", "DISPUTED"].includes(existing.status)
    ) {
      status = existing.status;
    }
    if (existing && input.winner && existing.winner_entry_id === winnerId && existing.status === "FORFEIT") {
      status = "FORFEIT";
    }

    const resultJson = JSON.stringify({ sourceMatchId: input.sourceMatchId, ...(input.extraResult ?? {}) });

    if (existing) {
      const preserveWorkflow = !participantsChanged && !resultChanged;
      await connection.execute(
        `UPDATE bracket_matches
         SET participant_a_entry_id = ?, participant_b_entry_id = ?, participant_c_entry_id = ?,
             winner_entry_id = ?, status = ?, result_json = ?,
             ready_a_at = ?, ready_b_at = ?,
             started_at = ?,
             completed_at = CASE WHEN ? IN ('COMPLETED', 'FORFEIT') THEN COALESCE(completed_at, CURRENT_TIMESTAMP(3)) ELSE NULL END,
             submitted_by = ?, submitted_at = ?, confirmation_due_at = ?,
             updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
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
          (id, bracket_id, round_number, match_number, participant_a_entry_id, participant_b_entry_id,
           participant_c_entry_id, winner_entry_id, status, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [matchId, bracketId, input.roundNumber, input.matchNumber, aId, bId, cId, winnerId, status, resultJson],
      );
    }
  }

  if (draft.format === "single") {
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    for (const round of rounds) {
      for (const match of round) {
        await upsertMatch({
          roundNumber: match.round + 1,
          matchNumber: match.index + 1,
          sourceMatchId: match.id,
          a: match.a,
          b: match.b,
          winner: match.winner,
          ready: Boolean(match.aReady && match.bReady && match.a && match.b),
          extraResult: { automaticBye: Boolean(match.winner && (!match.a || !match.b)) },
        });
      }
    }
  } else {
    const resolution = resolveThreePlayerAdvancement(draft.participants, draft.threeWinners);
    const matches = [
      { order: 1, a: resolution.playerA, b: resolution.playerB, winner: resolution.m1Winner },
      { order: 2, a: resolution.playerC, b: resolution.m1Loser, winner: resolution.m2Winner },
      { order: 3, a: resolution.playerC, b: resolution.m1Winner, winner: resolution.m3Winner },
    ];

    for (const match of matches) {
      await upsertMatch({
        roundNumber: match.order,
        matchNumber: 1,
        sourceMatchId: `m${match.order}`,
        a: match.a,
        b: match.b,
        winner: match.winner,
        ready: Boolean(match.a && match.b),
        extraResult: { advancingParticipantId: match.order === 3 ? resolution.champion?.id ?? null : null },
      });
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
