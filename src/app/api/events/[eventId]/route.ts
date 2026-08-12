import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { resolveUpdatedGameName } from "@/lib/event-game";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const optionalUrl = z.string().trim().url().max(1000).nullable().optional().or(z.literal(""));
const bracketFormatSchema = z.enum(["SINGLE_ELIMINATION", "THREE_PLAYER", "DOUBLE_ELIMINATION", "ROUND_ROBIN", "GROUPS_PLAYOFFS"]);
const updateSchema = z.object({
  name: z.string().trim().min(2).max(160), description: z.string().trim().max(5000).nullable().optional(),
  platformName: z.string().trim().max(80).nullable().optional(), subgameName: z.string().trim().max(191).nullable().optional(),
  gameFieldsTouched: z.boolean().default(false),
  gameUrl: optionalUrl, gameExternalId: z.string().trim().max(80).nullable().optional(), gameUniverseId: z.string().trim().max(80).nullable().optional(),
  gameThumbnailUrl: optionalUrl, requiredConnectionType: z.string().trim().max(50).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(), signupDeadline: z.string().datetime().nullable().optional(),
  checkInOpensAt: z.string().datetime().nullable().optional(), checkInDeadline: z.string().datetime().nullable().optional(),
  maxParticipants: z.number().int().min(0).max(10000).nullable().optional(), timezone: z.string().trim().min(2).max(100),
  visibility: z.enum(["SERVER", "CODE_ONLY", "UNLISTED", "PUBLIC", "STAFF_ONLY"]), joinCodeRequired: z.boolean(),
  bracketEnabled: z.boolean(), bracketFormat: bracketFormatSchema.nullable().optional(),
  bracketEntryMode: z.enum(["PLAYER", "TEAM"]).default("PLAYER"),
  bracketSeedingMode: z.enum(["RANDOM", "MANUAL"]).nullable().optional(), bracketAutoGenerate: z.boolean(), bracketRequireCheckIn: z.boolean(),
  bracketGroupCount: z.number().int().min(2).max(16).default(2), bracketAdvancersPerGroup: z.number().int().min(1).max(8).default(1),
  bracketTiebreakMode: z.enum(["HEAD_TO_HEAD_THEN_SEED", "SEED"]).default("HEAD_TO_HEAD_THEN_SEED"),
});

type EventAccessRow = RowDataPacket & {
  workspace_id: string;
  primary_host_id: string;
  status: string;
  game_name: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  bracket_enabled: number;
  bracket_format: string | null;
  bracket_entry_mode: string;
  bracket_seeding_mode: string | null;
  bracket_group_count: number;
  bracket_advancers_per_group: number;
  bracket_tiebreak_mode: string;
};
type LockedBracketRow = RowDataPacket & { id: string; status: "DRAFT" | "GENERATED" | "LIVE" | "COMPLETED" };
class EventEditConflict extends Error {}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event information.", details: parsed.error.flatten() }, { status: 400 });

  const rows = await query<EventAccessRow[]>(
    `SELECT workspace_id, primary_host_id, status, game_name, platform_name, subgame_name, bracket_enabled, bracket_format, bracket_entry_mode,
            bracket_seeding_mode, bracket_group_count, bracket_advancers_per_group, bracket_tiebreak_mode
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId
    || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_EVENTS")
    || cohost[0]?.permission_level === "FULL";
  if (!allowed) return NextResponse.json({ error: "You do not have permission to edit this event." }, { status: 403 });
  if (["LIVE", "COMPLETED"].includes(event.status)) return NextResponse.json({ error: "Live and completed events cannot be edited from the setup form." }, { status: 409 });

  const maximum = parsed.data.maxParticipants && parsed.data.maxParticipants > 0 ? parsed.data.maxParticipants : null;
  const bracketFormat = parsed.data.bracketEnabled ? parsed.data.bracketFormat ?? "SINGLE_ELIMINATION" : null;
  const seedingMode = parsed.data.bracketEnabled ? parsed.data.bracketSeedingMode ?? "RANDOM" : null;
  const gameName = resolveUpdatedGameName({
    submittedSubgameName: parsed.data.subgameName,
    submittedPlatformName: parsed.data.platformName,
    gameFieldsTouched: parsed.data.gameFieldsTouched,
    existingGameName: event.game_name,
    existingPlatformName: event.platform_name,
    existingSubgameName: event.subgame_name,
  });
  const requireCheckIn = parsed.data.bracketEntryMode === "PLAYER" && parsed.data.bracketRequireCheckIn;
  const competitionChanged = Boolean(parsed.data.bracketEnabled) !== Boolean(event.bracket_enabled)
    || bracketFormat !== event.bracket_format
    || parsed.data.bracketEntryMode !== event.bracket_entry_mode
    || seedingMode !== event.bracket_seeding_mode
    || parsed.data.bracketGroupCount !== event.bracket_group_count
    || parsed.data.bracketAdvancersPerGroup !== event.bracket_advancers_per_group
    || parsed.data.bracketTiebreakMode !== event.bracket_tiebreak_mode;

  try {
    await withTransaction(async (connection) => {
      const [lockedBrackets] = await connection.query<LockedBracketRow[]>(
        `SELECT id, status FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`,
        [eventId],
      );
      const lockedBracket = lockedBrackets[0] ?? null;
      if (competitionChanged && lockedBracket && ["LIVE", "COMPLETED"].includes(lockedBracket.status)) {
        throw new EventEditConflict("This competition has already gone live. Use Match Center correction/reopen tools instead of changing tournament setup, so match reports and dispute evidence are preserved.");
      }

      await connection.execute(
        `UPDATE events SET name = ?, description = ?, game_name = ?, platform_name = ?, subgame_name = ?,
           game_url = ?, game_external_id = ?, game_universe_id = ?, game_thumbnail_url = ?, required_connection_type = ?,
           starts_at = ?, signup_deadline = ?, check_in_opens_at = ?, check_in_deadline = ?, max_participants = ?, timezone = ?,
           visibility = ?, join_code_required = ?, bracket_enabled = ?, bracket_format = ?, bracket_entry_mode = ?, bracket_seeding_mode = ?,
           bracket_auto_generate = ?, bracket_require_check_in = ?, bracket_group_count = ?, bracket_advancers_per_group = ?, bracket_tiebreak_mode = ?,
           updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [
          parsed.data.name, parsed.data.description ?? null, gameName, parsed.data.platformName ?? null, parsed.data.subgameName ?? null,
          parsed.data.gameUrl || null, parsed.data.gameExternalId ?? null, parsed.data.gameUniverseId ?? null, parsed.data.gameThumbnailUrl || null,
          parsed.data.requiredConnectionType ?? null, parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
          parsed.data.signupDeadline ? new Date(parsed.data.signupDeadline) : null, parsed.data.checkInOpensAt ? new Date(parsed.data.checkInOpensAt) : null,
          parsed.data.checkInDeadline ? new Date(parsed.data.checkInDeadline) : null, maximum, parsed.data.timezone, parsed.data.visibility,
          parsed.data.joinCodeRequired ? 1 : 0, parsed.data.bracketEnabled ? 1 : 0, bracketFormat, parsed.data.bracketEntryMode, seedingMode,
          parsed.data.bracketAutoGenerate ? 1 : 0, requireCheckIn ? 1 : 0, parsed.data.bracketGroupCount,
          parsed.data.bracketAdvancersPerGroup, parsed.data.bracketTiebreakMode, eventId,
        ],
      );
      if (parsed.data.bracketEnabled && bracketFormat && seedingMode) {
        await connection.execute(
          `INSERT INTO brackets (id, event_id, format, status, seeding_mode) VALUES (?, ?, ?, 'DRAFT', ?)
           ON DUPLICATE KEY UPDATE
             format = VALUES(format), seeding_mode = VALUES(seeding_mode),
             status = IF(? = 1, 'DRAFT', status),
             settings_json = IF(? = 1, NULL, settings_json),
             generated_at = IF(? = 1, NULL, generated_at),
             completed_at = IF(? = 1, NULL, completed_at),
             updated_at = CURRENT_TIMESTAMP(3)`,
          [randomUUID(), eventId, bracketFormat, seedingMode, competitionChanged ? 1 : 0, competitionChanged ? 1 : 0, competitionChanged ? 1 : 0, competitionChanged ? 1 : 0],
        );
        if (competitionChanged) {
          const bracketId = lockedBracket?.id ?? (await connection.query<(RowDataPacket & { id: string })[]>(`SELECT id FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]))[0][0]?.id;
          if (bracketId) {
            await connection.execute(`DELETE FROM bracket_matches WHERE bracket_id = ?`, [bracketId]);
            await connection.execute(`DELETE FROM bracket_entries WHERE bracket_id = ?`, [bracketId]);
          }
        }
      }
    });
  } catch (error) {
    if (error instanceof EventEditConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: event.workspace_id,
    eventId,
    action: "event.updated",
    targetType: "event",
    targetId: eventId,
    details: { platformName: parsed.data.platformName, bracketEnabled: parsed.data.bracketEnabled, bracketFormat, bracketEntryMode: parsed.data.bracketEntryMode, competitionChanged },
  });
  return NextResponse.json({ success: true, competitionReset: competitionChanged && parsed.data.bracketEnabled });
}
