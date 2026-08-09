import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { syncBracketRecords } from "@/lib/bracket-normalization";
import {
  buildDoubleEliminationCompetition,
  buildFirstRound,
  buildGroupsPlayoffCompetition,
  buildRoundRobinCompetition,
  type BracketDraft,
  type Participant,
  type TieBreakMode,
} from "@/components/bracket/bracket-model";

type ParticipantRow = RowDataPacket & {
  user_id: string;
  display_name: string;
};
type TeamRow = RowDataPacket & {
  team_id: string;
  display_name: string;
  roster_json: string | null;
};
type BracketIdRow = RowDataPacket & { id: string };

export type DatabaseBracketFormat = "SINGLE_ELIMINATION" | "THREE_PLAYER" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_PLAYOFFS";

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function parseRoster(value: string | null): Participant["roster"] {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const item = member as { userId?: unknown; name?: unknown; role?: unknown };
      if (typeof item.userId !== "string" || typeof item.name !== "string") return [];
      return [{ userId: item.userId, name: item.name, role: typeof item.role === "string" ? item.role : undefined }];
    });
  } catch {
    return undefined;
  }
}

async function loadPlayerEntrants(connection: PoolConnection, eventId: string, requireCheckIn: boolean): Promise<Participant[]> {
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
  return rows.map((row) => ({ id: `user-${row.user_id}`, name: row.display_name, entrantType: "player" as const }));
}

async function loadTeamEntrants(connection: PoolConnection, eventId: string): Promise<Participant[]> {
  const [rows] = await connection.query<TeamRow[]>(
    `SELECT ete.team_id, t.name AS display_name, ete.roster_json
     FROM event_team_entries ete
     INNER JOIN teams t ON t.id = ete.team_id
     WHERE ete.event_id = ? AND ete.status = 'REGISTERED'
     ORDER BY COALESCE(ete.seed_number, 2147483647), ete.registered_at ASC`,
    [eventId],
  );
  return rows.map((row) => ({
    id: `team-${row.team_id}`,
    name: row.display_name,
    entrantType: "team" as const,
    teamId: row.team_id,
    roster: parseRoster(row.roster_json),
  }));
}

function buildDraft(input: {
  eventName: string;
  format: DatabaseBracketFormat;
  participants: Participant[];
  groupCount: number;
  advancersPerGroup: number;
  tieBreakMode: TieBreakMode;
  entryMode: "PLAYER" | "TEAM";
}): BracketDraft {
  const base: BracketDraft = {
    version: 2,
    title: input.eventName,
    format: "single",
    seedingMode: "random",
    participants: input.participants,
    firstRound: [],
    winners: {},
    threeWinners: {},
    entrantMode: input.entryMode === "TEAM" ? "team" : "player",
    tieBreakMode: input.tieBreakMode,
  };

  if (input.format === "THREE_PLAYER") return { ...base, format: "three" };
  if (input.format === "SINGLE_ELIMINATION") return { ...base, format: "single", firstRound: buildFirstRound(input.participants) };
  if (input.format === "DOUBLE_ELIMINATION") {
    return { ...base, format: "double", competitionMatches: buildDoubleEliminationCompetition(input.participants) };
  }
  if (input.format === "ROUND_ROBIN") {
    return { ...base, format: "round_robin", competitionMatches: buildRoundRobinCompetition(input.participants) };
  }
  const groups = buildGroupsPlayoffCompetition(input.participants, input.groupCount, input.advancersPerGroup);
  return {
    ...base,
    format: "groups",
    groups: groups.groups,
    groupAdvancers: groups.advancers,
    competitionMatches: groups.matches,
  };
}

export async function generateEventBracket(
  connection: PoolConnection,
  {
    eventId,
    eventName,
    format,
    seedingMode,
    requireCheckIn,
    entryMode = "PLAYER",
    groupCount = 2,
    advancersPerGroup = 1,
    tieBreakMode = "HEAD_TO_HEAD_THEN_SEED",
  }: {
    eventId: string;
    eventName: string;
    format: DatabaseBracketFormat;
    seedingMode: "RANDOM" | "MANUAL";
    requireCheckIn: boolean;
    entryMode?: "PLAYER" | "TEAM";
    groupCount?: number;
    advancersPerGroup?: number;
    tieBreakMode?: TieBreakMode;
  },
): Promise<{ generated: boolean; participantCount: number }> {
  if (seedingMode === "MANUAL") return { generated: false, participantCount: 0 };

  const loaded = entryMode === "TEAM"
    ? await loadTeamEntrants(connection, eventId)
    : await loadPlayerEntrants(connection, eventId, requireCheckIn);

  if (format === "THREE_PLAYER" && loaded.length !== 3) return { generated: false, participantCount: loaded.length };
  if (["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"].includes(format) && loaded.length < 2) return { generated: false, participantCount: loaded.length };
  if (format === "ROUND_ROBIN" && loaded.length < 2) return { generated: false, participantCount: loaded.length };
  if (format === "GROUPS_PLAYOFFS" && loaded.length < 4) return { generated: false, participantCount: loaded.length };

  const participants = shuffle(loaded);
  const state = buildDraft({ eventName, format, participants, groupCount, advancersPerGroup, tieBreakMode, entryMode });

  await connection.execute(
    `INSERT INTO brackets (id, event_id, format, status, seeding_mode, settings_json, generated_at)
     VALUES (?, ?, ?, 'GENERATED', ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       format = VALUES(format), status = 'GENERATED', seeding_mode = VALUES(seeding_mode),
       settings_json = VALUES(settings_json), generated_at = CURRENT_TIMESTAMP(3),
       completed_at = NULL, updated_at = CURRENT_TIMESTAMP(3)`,
    [randomUUID(), eventId, format, seedingMode, JSON.stringify(state)],
  );

  const [bracketRows] = await connection.query<BracketIdRow[]>(`SELECT id FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]);
  if (bracketRows[0]) await syncBracketRecords(connection, bracketRows[0].id, state);

  return { generated: true, participantCount: participants.length };
}
