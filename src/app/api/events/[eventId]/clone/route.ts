import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const cloneSchema = z.object({
  name: z.string().trim().min(2).max(160),
  keepSchedule: z.boolean().default(false),
});

type EventRow = RowDataPacket & {
  id: string; workspace_id: string; primary_host_id: string; description: string | null; game_name: string | null;
  platform_name: string | null; subgame_name: string | null; game_url: string | null; game_external_id: string | null;
  game_universe_id: string | null; game_thumbnail_url: string | null; required_connection_type: string | null;
  visibility: string; join_code_required: number; signup_mode: "AUTO" | "APPROVAL"; starts_at: Date | null;
  signup_deadline: Date | null; check_in_opens_at: Date | null; check_in_deadline: Date | null; max_participants: number | null;
  timezone: string; rules_json: string | null; staff_approval_required: number; bracket_enabled: number;
  bracket_format: "SINGLE_ELIMINATION" | "THREE_PLAYER" | null; bracket_seeding_mode: "RANDOM" | "MANUAL" | null;
  bracket_auto_generate: number; bracket_require_check_in: number;
};

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = cloneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name for the duplicated event." }, { status: 400 });

  const rows = await query<EventRow[]>(
    `SELECT id, workspace_id, primary_host_id, description, game_name, platform_name, subgame_name,
            game_url, game_external_id, game_universe_id, game_thumbnail_url, required_connection_type,
            visibility, join_code_required, signup_mode, starts_at, signup_deadline, check_in_opens_at, check_in_deadline,
            max_participants, timezone, rules_json, staff_approval_required, bracket_enabled, bracket_format,
            bracket_seeding_mode, bracket_auto_generate, bracket_require_check_in
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const source = rows[0];
  if (!source) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const cohostRows = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const [canManageOriginal, canHost] = await Promise.all([
    hasWorkspacePermission(session.userId, source.workspace_id, "MANAGE_EVENTS"),
    hasWorkspacePermission(session.userId, source.workspace_id, "HOST_EVENTS"),
  ]);
  const canClone = source.primary_host_id === session.userId || canManageOriginal || cohostRows[0]?.permission_level === "FULL";
  if (!canClone || !canHost) return NextResponse.json({ error: "Host permission is required to duplicate this event." }, { status: 403 });

  const newEventId = randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO events
        (id, workspace_id, name, description, game_name, platform_name, subgame_name, game_url, game_external_id,
         game_universe_id, game_thumbnail_url, required_connection_type, status, visibility, join_code_required, signup_mode,
         starts_at, signup_deadline, check_in_opens_at, check_in_deadline, max_participants, timezone, rules_json,
         bracket_enabled, bracket_format, bracket_seeding_mode, bracket_auto_generate, bracket_require_check_in,
         staff_approval_required, created_by, primary_host_id, cloned_from_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newEventId, source.workspace_id, parsed.data.name, source.description, source.game_name, source.platform_name,
        source.subgame_name, source.game_url, source.game_external_id, source.game_universe_id, source.game_thumbnail_url,
        source.required_connection_type, source.visibility, source.join_code_required, source.signup_mode,
        parsed.data.keepSchedule ? source.starts_at : null,
        parsed.data.keepSchedule ? source.signup_deadline : null,
        parsed.data.keepSchedule ? source.check_in_opens_at : null,
        parsed.data.keepSchedule ? source.check_in_deadline : null,
        source.max_participants, source.timezone, source.rules_json, source.bracket_enabled, source.bracket_format,
        source.bracket_seeding_mode, source.bracket_auto_generate, source.bracket_require_check_in,
        source.staff_approval_required, session.userId, session.userId, eventId,
      ],
    );
    if (source.bracket_enabled && source.bracket_format && source.bracket_seeding_mode) {
      await connection.execute(
        `INSERT INTO brackets (id, event_id, format, status, seeding_mode) VALUES (?, ?, ?, 'DRAFT', ?)`,
        [randomUUID(), newEventId, source.bracket_format, source.bracket_seeding_mode],
      );
    }
  });

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: source.workspace_id,
    eventId: newEventId,
    action: "event.cloned",
    targetType: "event",
    targetId: newEventId,
    details: { clonedFromEventId: eventId, keepSchedule: parsed.data.keepSchedule },
  });
  return NextResponse.json({ eventId: newEventId }, { status: 201 });
}
