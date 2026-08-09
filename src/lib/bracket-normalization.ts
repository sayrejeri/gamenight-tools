import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import {
  bracketChampion,
  deriveSingleElimination,
  resolveThreePlayerAdvancement,
  type BracketDraft,
  type Participant,
} from "@/components/bracket/bracket-model";

function linkedUserId(participant: Participant): string | null {
  const match = /^user-(\d+)$/.exec(participant.id);
  return match?.[1] ?? null;
}

export async function syncBracketRecords(connection: PoolConnection, bracketId: string, draft: BracketDraft): Promise<void> {
  await connection.execute(`DELETE FROM bracket_matches WHERE bracket_id = ?`, [bracketId]);
  await connection.execute(`DELETE FROM bracket_entries WHERE bracket_id = ?`, [bracketId]);

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

  const entryIds = new Map<string, string>();
  for (const [index, participant] of draft.participants.entries()) {
    const entryId = randomUUID();
    entryIds.set(participant.id, entryId);
    const status = champion?.id === participant.id ? "ADVANCED" : eliminated.has(participant.id) ? "ELIMINATED" : "ACTIVE";
    await connection.execute(
      `INSERT INTO bracket_entries (id, bracket_id, user_id, display_name, seed_number, slot_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entryId, bracketId, linkedUserId(participant), participant.name, index + 1, index + 1, status],
    );
  }

  if (draft.format === "single") {
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    for (const round of rounds) {
      for (const match of round) {
        const ready = Boolean(match.aReady && match.bReady && match.a && match.b);
        const status = match.winner ? "COMPLETED" : ready ? "READY" : "PENDING";
        const automaticBye = Boolean(match.winner && (!match.a || !match.b));
        await connection.execute(
          `INSERT INTO bracket_matches
            (id, bracket_id, round_number, match_number, participant_a_entry_id, participant_b_entry_id,
             winner_entry_id, status, result_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(), bracketId, match.round + 1, match.index + 1,
            match.a ? entryIds.get(match.a.id) ?? null : null,
            match.b ? entryIds.get(match.b.id) ?? null : null,
            match.winner ? entryIds.get(match.winner.id) ?? null : null,
            status,
            JSON.stringify({ sourceMatchId: match.id, automaticBye }),
          ],
        );
      }
    }
    return;
  }

  const resolution = resolveThreePlayerAdvancement(draft.participants, draft.threeWinners);
  const matches = [
    { order: 1, a: resolution.playerA, b: resolution.playerB, winner: resolution.m1Winner },
    { order: 2, a: resolution.playerC, b: resolution.m1Loser, winner: resolution.m2Winner },
    { order: 3, a: resolution.playerC, b: resolution.m1Winner, winner: resolution.m3Winner },
  ];

  for (const match of matches) {
    const status = match.winner ? "COMPLETED" : match.a && match.b ? "READY" : "PENDING";
    await connection.execute(
      `INSERT INTO bracket_matches
        (id, bracket_id, round_number, match_number, participant_a_entry_id, participant_b_entry_id,
         winner_entry_id, status, result_json)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), bracketId, match.order,
        match.a ? entryIds.get(match.a.id) ?? null : null,
        match.b ? entryIds.get(match.b.id) ?? null : null,
        match.winner ? entryIds.get(match.winner.id) ?? null : null,
        status,
        JSON.stringify({
          sourceMatchId: `m${match.order}`,
          advancingParticipantId: match.order === 3 ? resolution.champion?.id ?? null : null,
        }),
      ],
    );
  }
}
