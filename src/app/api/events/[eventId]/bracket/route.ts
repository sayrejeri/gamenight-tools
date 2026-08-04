import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const saveSchema = z.object({
  format: z.enum(["SINGLE_ELIMINATION", "THREE_PLAYER"]),
  seedingMode: z.enum(["RANDOM", "MANUAL"]),
  state: z.unknown(),
});

type EventRow = RowDataPacket & {
  workspace_id: string;
  primary_host_id: string;
};

async function canEditBracket(userId: string, eventId: string) {
  const events = await query<EventRow[]>(
    `SELECT workspace_id, primary_host_id FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return { allowed: false as const, event: null };

  const role = await getWorkspaceRole(userId, event.workspace_id);
  if (event.primary_host_id === userId || canManageCodes(role)) {
    return { allowed: true as const, event };
  }

  const cohosts = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED'
       AND permission_level IN ('FULL', 'BRACKET')
     LIMIT 1`,
    [eventId, userId],
  );

  return { allowed: Boolean(cohosts[0]), event };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed) return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });

  const rows = await query<(RowDataPacket & {
    format: string;
    seeding_mode: string;
    settings_json: string | null;
    status: string;
  })[]>(
    `SELECT format, seeding_mode, settings_json, status FROM brackets WHERE event_id = ? LIMIT 1`,
    [eventId],
  );

  const bracket = rows[0];
  return NextResponse.json({
    bracket: bracket
      ? {
          format: bracket.format,
          seedingMode: bracket.seeding_mode,
          status: bracket.status,
          state: bracket.settings_json ? JSON.parse(bracket.settings_json) : null,
        }
      : null,
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed || !access.event) {
    return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid bracket draft." }, { status: 400 });

  const serialized = JSON.stringify(parsed.data.state);
  if (serialized.length > 1_000_000) {
    return NextResponse.json({ error: "The bracket draft is too large to save." }, { status: 413 });
  }

  const bracketId = randomUUID();
  await getPool().execute(
    `INSERT INTO brackets
      (id, event_id, format, status, seeding_mode, settings_json, generated_at)
     VALUES (?, ?, ?, 'GENERATED', ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       format = VALUES(format),
       status = 'GENERATED',
       seeding_mode = VALUES(seeding_mode),
       settings_json = VALUES(settings_json),
       generated_at = CURRENT_TIMESTAMP(3),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [bracketId, eventId, parsed.data.format, parsed.data.seedingMode, serialized],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "bracket.saved",
    targetType: "bracket",
    targetId: eventId,
    details: { format: parsed.data.format, seedingMode: parsed.data.seedingMode },
  });

  return NextResponse.json({ success: true });
}
