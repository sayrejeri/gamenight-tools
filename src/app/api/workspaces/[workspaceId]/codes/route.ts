import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { generateInviteCode, hashInviteCode } from "@/lib/codes";
import type { RowDataPacket } from "mysql2";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const codeSchema = z.object({
  type: z.enum(["STAFF", "HOST", "EVENT"]),
  grantRole: z.enum(["ADMIN", "STAFF", "HOST", "REFEREE", "VIEWER"]).nullable().optional(),
  targetEventId: z.string().uuid().nullable().optional(),
  maxUses: z.number().int().positive().max(10000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(255).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { workspaceId } = await context.params;
  const role = await getWorkspaceRole(session.userId, workspaceId);
  if (!canManageCodes(role)) {
    return NextResponse.json({ error: "Staff permission is required to create codes." }, { status: 403 });
  }

  const parsed = codeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code settings.", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.type === "EVENT" && !parsed.data.targetEventId) {
    return NextResponse.json({ error: "An event code must target an event." }, { status: 400 });
  }

  if (parsed.data.type === "EVENT" && parsed.data.targetEventId) {
    const eventRows = await query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM events WHERE id = ? AND workspace_id = ? LIMIT 1`,
      [parsed.data.targetEventId, workspaceId],
    );
    if (!eventRows[0]) {
      return NextResponse.json({ error: "That event does not belong to this workspace." }, { status: 400 });
    }
  }

  const prefix = parsed.data.type === "EVENT" ? "GN" : parsed.data.type;
  const visibleCode = generateInviteCode(prefix);
  const id = randomUUID();
  const grantRole = parsed.data.type === "EVENT" ? null : parsed.data.grantRole ?? parsed.data.type;

  await getPool().execute(
    `INSERT INTO invite_codes
      (id, workspace_id, target_event_id, code_hash, code_prefix, code_type, grant_role,
       max_uses, expires_at, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      parsed.data.targetEventId ?? null,
      hashInviteCode(visibleCode),
      visibleCode.slice(0, 12),
      parsed.data.type,
      grantRole,
      parsed.data.maxUses ?? null,
      parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      parsed.data.note ?? null,
      session.userId,
    ],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId,
    eventId: parsed.data.targetEventId ?? null,
    action: "invite_code.created",
    targetType: "invite_code",
    targetId: id,
    details: {
      type: parsed.data.type,
      maxUses: parsed.data.maxUses ?? null,
      expiresAt: parsed.data.expiresAt ?? null,
      grantRole,
    },
  });

  return NextResponse.json(
    {
      id,
      code: visibleCode,
      warning: "Save this code now. The full code is not stored or shown again.",
    },
    { status: 201 },
  );
}
