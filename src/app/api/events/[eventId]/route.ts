import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const optionalUrl = z.string().trim().url().max(1000).nullable().optional().or(z.literal(""));
const updateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  platformName: z.string().trim().max(80).nullable().optional(),
  subgameName: z.string().trim().max(191).nullable().optional(),
  gameUrl: optionalUrl,
  gameExternalId: z.string().trim().max(80).nullable().optional(),
  gameUniverseId: z.string().trim().max(80).nullable().optional(),
  gameThumbnailUrl: optionalUrl,
  requiredConnectionType: z.string().trim().max(50).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  signupDeadline: z.string().datetime().nullable().optional(),
  checkInOpensAt: z.string().datetime().nullable().optional(),
  checkInDeadline: z.string().datetime().nullable().optional(),
  maxParticipants: z.number().int().min(0).max(10000).nullable().optional(),
  timezone: z.string().trim().min(2).max(100),
  visibility: z.enum(["SERVER", "CODE_ONLY", "UNLISTED", "PUBLIC", "STAFF_ONLY"]),
  joinCodeRequired: z.boolean(),
  bracketEnabled: z.boolean(),
  bracketFormat: z.enum(["SINGLE_ELIMINATION", "THREE_PLAYER"]).nullable().optional(),
  bracketSeedingMode: z.enum(["RANDOM", "MANUAL"]).nullable().optional(),
  bracketAutoGenerate: z.boolean(),
  bracketRequireCheckIn: z.boolean(),
});

type EventAccessRow = RowDataPacket & {
  workspace_id: string;
  primary_host_id: string;
  status: string;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event information.", details: parsed.error.flatten() }, { status: 400 });

  const rows = await query<EventAccessRow[]>(
    `SELECT workspace_id, primary_host_id, status FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const role = await getWorkspaceRole(session.userId, event.workspace_id);
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId || canManageCodes(role) || cohost[0]?.permission_level === "FULL";
  if (!allowed) return NextResponse.json({ error: "You cannot edit this event." }, { status: 403 });
  if (["LIVE", "COMPLETED"].includes(event.status)) {
    return NextResponse.json({ error: "Live and completed events cannot be edited from the setup form." }, { status: 409 });
  }

  const maximum = parsed.data.maxParticipants && parsed.data.maxParticipants > 0 ? parsed.data.maxParticipants : null;
  const bracketFormat = parsed.data.bracketEnabled ? parsed.data.bracketFormat ?? "SINGLE_ELIMINATION" : null;
  const seedingMode = parsed.data.bracketEnabled ? parsed.data.bracketSeedingMode ?? "RANDOM" : null;
  const gameName = parsed.data.subgameName || parsed.data.platformName || null;

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE events SET
         name = ?, description = ?, game_name = ?, platform_name = ?, subgame_name = ?,
         game_url = ?, game_external_id = ?, game_universe_id = ?, game_thumbnail_url = ?,
         required_connection_type = ?, starts_at = ?, signup_deadline = ?,
         check_in_opens_at = ?, check_in_deadline = ?, max_participants = ?, timezone = ?,
         visibility = ?, join_code_required = ?, bracket_enabled = ?, bracket_format = ?,
         bracket_seeding_mode = ?, bracket_auto_generate = ?, bracket_require_check_in = ?,
         updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        parsed.data.name,
        parsed.data.description ?? null,
        gameName,
        parsed.data.platformName ?? null,
        parsed.data.subgameName ?? null,
        parsed.data.gameUrl || null,
        parsed.data.gameExternalId ?? null,
        parsed.data.gameUniverseId ?? null,
        parsed.data.gameThumbnailUrl || null,
        parsed.data.requiredConnectionType ?? null,
        parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
        parsed.data.signupDeadline ? new Date(parsed.data.signupDeadline) : null,
        parsed.data.checkInOpensAt ? new Date(parsed.data.checkInOpensAt) : null,
        parsed.data.checkInDeadline ? new Date(parsed.data.checkInDeadline) : null,
        maximum,
        parsed.data.timezone,
        parsed.data.visibility,
        parsed.data.joinCodeRequired ? 1 : 0,
        parsed.data.bracketEnabled ? 1 : 0,
        bracketFormat,
        seedingMode,
        parsed.data.bracketAutoGenerate ? 1 : 0,
        parsed.data.bracketRequireCheckIn ? 1 : 0,
        eventId,
      ],
    );

    if (parsed.data.bracketEnabled && bracketFormat && seedingMode) {
      await connection.execute(
        `INSERT INTO brackets (id, event_id, format, status, seeding_mode)
         VALUES (?, ?, ?, 'DRAFT', ?)
         ON DUPLICATE KEY UPDATE format = VALUES(format), seeding_mode = VALUES(seeding_mode),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [randomUUID(), eventId, bracketFormat, seedingMode],
      );
    }
  });

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: event.workspace_id,
    eventId,
    action: "event.updated",
    targetType: "event",
    targetId: eventId,
    details: { platformName: parsed.data.platformName, bracketEnabled: parsed.data.bracketEnabled },
  });

  return NextResponse.json({ success: true });
}
