import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { bracketChampion, isDraft, type BracketFormat } from "@/components/bracket/bracket-model";
import { syncBracketRecords } from "@/lib/bracket-normalization";

const databaseFormats = ["SINGLE_ELIMINATION", "THREE_PLAYER", "DOUBLE_ELIMINATION", "ROUND_ROBIN", "GROUPS_PLAYOFFS"] as const;
const saveSchema = z.object({
  format: z.enum(databaseFormats),
  seedingMode: z.enum(["RANDOM", "MANUAL"]),
  state: z.unknown(),
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});
const statusSchema = z.object({ status: z.enum(["GENERATED", "LIVE", "COMPLETED"]) });

type DatabaseFormat = typeof databaseFormats[number];
type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string };
type BracketRow = RowDataPacket & {
  id: string;
  format: string;
  seeding_mode: string;
  settings_json: string | null;
  status: "DRAFT" | "GENERATED" | "LIVE" | "COMPLETED";
  updated_at: Date;
};

function draftFormatForDatabase(format: DatabaseFormat): BracketFormat {
  if (format === "THREE_PLAYER") return "three";
  if (format === "DOUBLE_ELIMINATION") return "double";
  if (format === "ROUND_ROBIN") return "round_robin";
  if (format === "GROUPS_PLAYOFFS") return "groups";
  return "single";
}

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

function sameRevision(actual: Date, expected: string | null | undefined): boolean {
  if (!expected) return false;
  const parsed = new Date(expected);
  return !Number.isNaN(parsed.getTime()) && actual.getTime() === parsed.getTime();
}

export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed) return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });
  const rows = await query<BracketRow[]>(
    `SELECT id, format, seeding_mode, settings_json, status, updated_at FROM brackets WHERE event_id = ? LIMIT 1`, [eventId],
  );
  const bracket = rows[0];
  return NextResponse.json({
    bracket: bracket ? {
      id: bracket.id,
      format: bracket.format,
      seedingMode: bracket.seeding_mode,
      status: bracket.status,
      updatedAt: new Date(bracket.updated_at).toISOString(),
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
  if (!parsed.success || !isDraft(parsed.data?.state)) return NextResponse.json({ error: "Invalid competition draft." }, { status: 400 });
  const draft = parsed.data.state;
  if (draftFormatForDatabase(parsed.data.format) !== draft.format) {
    return NextResponse.json({ error: "Competition format does not match the saved state." }, { status: 400 });
  }
  if (parsed.data.seedingMode.toLowerCase() !== draft.seedingMode) {
    return NextResponse.json({ error: "Competition placement mode does not match the saved state." }, { status: 400 });
  }
  if (["double", "round_robin", "groups"].includes(draft.format) && !(draft.competitionMatches?.length)) {
    return NextResponse.json({ error: "Generate the competition schedule before saving it." }, { status: 400 });
  }
  const serialized = JSON.stringify(draft);
  if (serialized.length > 2_000_000) return NextResponse.json({ error: "The competition draft is too large to save." }, { status: 413 });

  const result = await withTransaction(async (connection) => {
    const [existingRows] = await connection.query<BracketRow[]>(
      `SELECT id, format, seeding_mode, settings_json, status, updated_at FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`,
      [eventId],
    );
    const existing = existingRows[0];
    if (existing?.status === "COMPLETED") return { ok: false as const, statusCode: 409, error: "This competition is completed. Reopen it before editing placement." };
    if (existing?.status === "LIVE") return { ok: false as const, statusCode: 409, error: "This competition is live. Use Match Center for results, forfeits, disputes, or corrections." };
    if (existing && !sameRevision(new Date(existing.updated_at), parsed.data.expectedUpdatedAt)) {
      return { ok: false as const, statusCode: 409, error: "This competition changed after you opened the editor. Reload before saving so newer tournament changes are not overwritten." };
    }

    const bracketId = existing?.id ?? randomUUID();
    await connection.execute(
      `INSERT INTO brackets (id, event_id, format, status, seeding_mode, settings_json, generated_at, completed_at)
       VALUES (?, ?, ?, 'GENERATED', ?, ?, CURRENT_TIMESTAMP(3), NULL)
       ON DUPLICATE KEY UPDATE format = VALUES(format), status = 'GENERATED', seeding_mode = VALUES(seeding_mode),
         settings_json = VALUES(settings_json), generated_at = CURRENT_TIMESTAMP(3), completed_at = NULL, updated_at = CURRENT_TIMESTAMP(3)`,
      [bracketId, eventId, parsed.data.format, parsed.data.seedingMode, serialized],
    );
    await syncBracketRecords(connection, bracketId, draft);
    const [freshRows] = await connection.query<(RowDataPacket & { updated_at: Date })[]>(`SELECT updated_at FROM brackets WHERE id = ? LIMIT 1`, [bracketId]);
    return { ok: true as const, bracketId, status: "GENERATED" as const, updatedAt: new Date(freshRows[0].updated_at).toISOString() };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.statusCode });

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "bracket.saved",
    targetType: "bracket",
    targetId: result.bracketId,
    details: { format: parsed.data.format, seedingMode: parsed.data.seedingMode, status: result.status, entrantMode: draft.entrantMode ?? "player" },
  });
  return NextResponse.json({ success: true, status: result.status, updatedAt: result.updatedAt });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await canEditBracket(session.userId, eventId);
  if (!access.allowed || !access.event) return NextResponse.json({ error: "Bracket manager permission is required." }, { status: 403 });
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid competition status." }, { status: 400 });

  const result = await withTransaction(async (connection) => {
    const [rows] = await connection.query<BracketRow[]>(
      `SELECT id, format, seeding_mode, settings_json, status, updated_at FROM brackets WHERE event_id = ? LIMIT 1 FOR UPDATE`,
      [eventId],
    );
    const bracket = rows[0];
    if (!bracket || !bracket.settings_json) return { ok: false as const, statusCode: 400, error: "Save the competition before changing its status." };
    if (parsed.data.status === "GENERATED" && ["LIVE", "COMPLETED"].includes(bracket.status)) {
      return { ok: false as const, statusCode: 409, error: "A live or completed competition cannot return to editable Generated state. Use Match Center to reopen or correct results." };
    }

    let state: unknown = null;
    try { state = JSON.parse(bracket.settings_json); } catch { state = null; }
    if (!isDraft(state)) return { ok: false as const, statusCode: 409, error: "The saved competition state is invalid." };
    if (parsed.data.status === "COMPLETED" && !bracketChampion(state)) {
      return { ok: false as const, statusCode: 400, error: "Finish every required match in Match Center before marking the competition completed." };
    }

    await connection.execute(
      `UPDATE brackets SET status = ?, completed_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [parsed.data.status, parsed.data.status, bracket.id],
    );
    await syncBracketRecords(connection, bracket.id, state);
    const [freshRows] = await connection.query<(RowDataPacket & { updated_at: Date })[]>(`SELECT updated_at FROM brackets WHERE id = ? LIMIT 1`, [bracket.id]);
    return { ok: true as const, bracketId: bracket.id, previousStatus: bracket.status, updatedAt: new Date(freshRows[0].updated_at).toISOString() };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.statusCode });
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "bracket.status_changed",
    targetType: "bracket",
    targetId: result.bracketId,
    details: { from: result.previousStatus, to: parsed.data.status },
  });
  return NextResponse.json({ success: true, status: parsed.data.status, updatedAt: result.updatedAt });
}
