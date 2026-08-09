import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { syncBracketRecords } from "@/lib/bracket-normalization";
import type { BracketDraft } from "@/components/bracket/bracket-model";

type ParticipantRow = RowDataPacket & {
  user_id: string;
  display_name: string;
};
type BracketIdRow = RowDataPacket & { id: string };

type Pair = [
  { id: string; name: string } | null,
  { id: string; name: string } | null,
];

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function buildFirstRound(participants: Array<{ id: string; name: string }>): Pair[] {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, participants.length)));
  const pairCount = size / 2;
  const byeCount = size - participants.length;
  const playedMatchCount = pairCount - byeCount;
  const playedPositions = new Set<number>();
  for (let index = 0; index < playedMatchCount; index += 1) {
    playedPositions.add(Math.floor(((index + 0.5) * pairCount) / playedMatchCount));
  }

  const pairs: Pair[] = [];
  let cursor = 0;
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const a = participants[cursor] ?? null;
    cursor += 1;
    if (playedPositions.has(pairIndex)) {
      const b = participants[cursor] ?? null;
      cursor += 1;
      pairs.push([a, b]);
    } else {
      pairs.push([a, null]);
    }
  }
  return pairs;
}

export async function generateEventBracket(
  connection: PoolConnection,
  {
    eventId,
    eventName,
    format,
    seedingMode,
    requireCheckIn,
  }: {
    eventId: string;
    eventName: string;
    format: "SINGLE_ELIMINATION" | "THREE_PLAYER";
    seedingMode: "RANDOM" | "MANUAL";
    requireCheckIn: boolean;
  },
): Promise<{ generated: boolean; participantCount: number }> {
  if (seedingMode === "MANUAL") return { generated: false, participantCount: 0 };

  const [rows] = await connection.query<ParticipantRow[]>(
    `SELECT CAST(ep.user_id AS CHAR) AS user_id,
            COALESCE(NULLIF(ep.game_identity_value, ''), u.global_name, u.username) AS display_name
     FROM event_participants ep
     INNER JOIN users u ON u.id = ep.user_id
     WHERE ep.event_id = ?
       AND ep.status = 'APPROVED'
       AND (? = 0 OR ep.checked_in_at IS NOT NULL)
     ORDER BY ep.joined_at ASC`,
    [eventId, requireCheckIn ? 1 : 0],
  );

  if (format === "THREE_PLAYER" && rows.length !== 3) {
    return { generated: false, participantCount: rows.length };
  }
  if (format === "SINGLE_ELIMINATION" && rows.length < 2) {
    return { generated: false, participantCount: rows.length };
  }

  const participants = shuffle(rows.map((row) => ({
    id: `user-${row.user_id}`,
    name: row.display_name,
  })));

  const state: BracketDraft = format === "THREE_PLAYER"
    ? {
        version: 1,
        title: eventName,
        format: "three",
        seedingMode: "random",
        participants,
        firstRound: [],
        winners: {},
        threeWinners: {},
      }
    : {
        version: 1,
        title: eventName,
        format: "single",
        seedingMode: "random",
        participants,
        firstRound: buildFirstRound(participants),
        winners: {},
        threeWinners: {},
      };

  await connection.execute(
    `INSERT INTO brackets (id, event_id, format, status, seeding_mode, settings_json, generated_at)
     VALUES (?, ?, ?, 'GENERATED', ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       format = VALUES(format),
       status = 'GENERATED',
       seeding_mode = VALUES(seeding_mode),
       settings_json = VALUES(settings_json),
       generated_at = CURRENT_TIMESTAMP(3),
       completed_at = NULL,
       updated_at = CURRENT_TIMESTAMP(3)`,
    [randomUUID(), eventId, format, seedingMode, JSON.stringify(state)],
  );

  const [bracketRows] = await connection.query<BracketIdRow[]>(`SELECT id FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]);
  if (bracketRows[0]) await syncBracketRecords(connection, bracketRows[0].id, state);

  return { generated: true, participantCount: participants.length };
}
