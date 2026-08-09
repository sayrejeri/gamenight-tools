import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { bracketChampion, isDraft } from "@/components/bracket/bracket-model";
import { syncBracketRecords } from "@/lib/bracket-normalization";

const saveSchema = z.object({
  format: z.enum(["SINGLE_ELIMINATION", "THREE_PLAYER"]),
  seedingMode: z.enum(["RANDOM", "MANUAL"]),
  state: z.unknown(),
});
const statusSchema = z.object({ status: z.enum(["GENERATED", "LIVE", "COMPLETED"]) });

type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string };
type BracketRow = RowDataPacket & {
  id: string;
  format: string;
  seeding_mode: string;
  settings_json: string | null;
  status: "DRAFT" | "GENERATED" | "LIVE" | "COMPLETED";
};

async function canEditBracket(userId: string, eventId: string) {
  const events = await query<EventRow[]>(`SELECT workspace_id, primary_host_id FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = events[0];
  if (!event) return { allowed: false as const, event: null };
  if (event.primary_host_id === userId || await hasWorkspacePermission(userId, event.workspace_id, "MANAGE_BRACKETS")) return { allowed: true as const, event };
  const cohosts = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED'
       AND permission_level IN ('FULL', 'BRACKET') LIMIT 1`, [eventId, userId],
  );
  return { allowed: Boolean(cohosts[0]), event };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed) return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });
  const rows = await query<BracketRow[]>(
    `SELECT id, format, seeding_mode, settings_json, status FROM brackets WHERE event_id = ? LIMIT 1`, [eventId],
  );
  const bracket = rows[0];
  return NextResponse.json({
    bracket: bracket ? {
      id: bracket.id,
      format: bracket.format,
      seedingMode: bracket.seeding_mode,
      status: bracket.status,
      state: bracket.settings_json ? JSON.parse(bracket.settings_json) : null,
    } : null,
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed || !access.event) return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isDraft(parsed.data?.state)) return NextResponse.json({ error: "Invalid bracket draft." }, { status: 400 });
  const draft = parsed.data.state;
  if ((parsed.data.format === "SINGLE_ELIMINATION") !== (draft.format === "single")) {
    return NextResponse.json({ error: "Bracket format does not match the saved state." }, { status: 400 });
  }
  if (parsed.data.seedingMode.toLowerCase() !== draft.seedingMode) {
    return NextResponse.json({ error: "Bracket placement mode does not match the saved state." }, { status: 400 });
  }
  const serialized = JSON.stringify(draft);
  if (serialized.length > 1_000_000) return NextResponse.json({ error: "The bracket draft is too large to save." }, { status: 413 });

  const result = await withTransaction(async (connection) => {
    const [existingRows] = await connection.query<BracketRow[]>(
      `SELECT id, format, seeding_mode, settings_json, status FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`,
      [eventId],
    );
    const existing = existingRows[0];
    if (existing?.status === "COMPLETED") {
      return { locked: true as const, bracketId: existing.id, status: existing.status };
    }

    const bracketId = existing?.id ?? randomUUID();
    const nextStatus = existing?.status === "LIVE" ? "LIVE" : "GENERATED";
    await connection.execute(
      `INSERT INTO brackets (id, event_id, format, status, seeding_mode, settings_json, generated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), NULL)
       ON DUPLICATE KEY UPDATE format = VALUES(format), status = VALUES(status), seeding_mode = VALUES(seeding_mode),
         settings_json = VALUES(settings_json), generated_at = CURRENT_TIMESTAMP(3), completed_at = NULL, updated_at = CURRENT_TIMESTAMP(3)`,
      [bracketId, eventId, parsed.data.format, nextStatus, parsed.data.seedingMode, serialized],
    );
    await syncBracketRecords(connection, bracketId, draft);
    return { locked: false as const, bracketId, status: nextStatus };
  });

  if (result.locked) return NextResponse.json({ error: "This bracket is completed. Reopen it before editing results or placement." }, { status: 409 });

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "bracket.saved",
    targetType: "bracket",
    targetId: result.bracketId,
    details: { format: parsed.data.format, seedingMode: parsed.data.seedingMode, status: result.status },
  });
  return NextResponse.json({ success: true, status: result.status });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed || !access.event) return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid bracket status." }, { status: 400 });

  const rows = await query<BracketRow[]>(
    `SELECT id, format, seeding_mode, settings_json, status FROM brackets WHERE event_id = ? LIMIT 1`, [eventId],
  );
  const bracket = rows[0];
  if (!bracket || !bracket.settings_json) return NextResponse.json({ error: "Save the bracket before changing its status." }, { status: 400 });

  let state: unknown = null;
  try { state = JSON.parse(bracket.settings_json); } catch { state = null; }
  if (!isDraft(state)) return NextResponse.json({ error: "The saved bracket state is invalid." }, { status: 409 });
  if (parsed.data.status === "COMPLETED" && !bracketChampion(state)) {
    return NextResponse.json({ error: "Finish every required match before marking the bracket completed." }, { status: 400 });
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE brackets
       SET status = ?, completed_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [parsed.data.status, parsed.data.status, bracket.id],
    );
    await syncBracketRecords(connection, bracket.id, state);
  });

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "bracket.status_changed",
    targetType: "bracket",
    targetId: bracket.id,
    details: { from: bracket.status, to: parsed.data.status },
  });
  return NextResponse.json({ success: true, status: parsed.data.status });
}
