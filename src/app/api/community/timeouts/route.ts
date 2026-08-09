import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getCommunityScopeAccess } from "@/lib/community-chat";

const timeoutSchema = z.object({
  scopeType: z.enum(["WORKSPACE", "TEAM"]),
  scopeId: z.string().uuid(),
  userId: z.string().min(1).max(32),
  durationMinutes: z.number().int().min(1).max(10080),
  reason: z.string().trim().max(500).optional().default(""),
});

const removeSchema = z.object({
  scopeType: z.enum(["WORKSPACE", "TEAM"]),
  scopeId: z.string().uuid(),
  userId: z.string().min(1).max(32),
});

async function isProtectedOwner(scopeType: "WORKSPACE" | "TEAM", scopeId: string, userId: string): Promise<boolean> {
  if (scopeType === "WORKSPACE") {
    const rows = await query<(RowDataPacket & { role: string })[]>(
      `SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'ACTIVE' LIMIT 1`,
      [scopeId, userId],
    );
    return rows[0]?.role === "OWNER";
  }
  const rows = await query<(RowDataPacket & { role: string })[]>(
    `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [scopeId, userId],
  );
  return rows[0]?.role === "OWNER";
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = timeoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid timeout settings." }, { status: 400 });
  const { scopeType, scopeId, userId, durationMinutes, reason } = parsed.data;

  if (userId === session.userId) return NextResponse.json({ error: "You cannot time yourself out." }, { status: 409 });
  const [actorAccess, targetAccess] = await Promise.all([
    getCommunityScopeAccess(session.userId, scopeType, scopeId),
    getCommunityScopeAccess(userId, scopeType, scopeId),
  ]);
  if (!actorAccess?.canTimeoutMembers) return NextResponse.json({ error: "Chat timeout permission is required." }, { status: 403 });
  if (!targetAccess?.canRead) return NextResponse.json({ error: "That user is not an active member of this chat." }, { status: 404 });
  if (await isProtectedOwner(scopeType, scopeId, userId)) {
    return NextResponse.json({ error: "Community Owners cannot be timed out from their own chat." }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);
  await getPool().execute(
    `INSERT INTO community_chat_timeouts (scope_type, scope_id, user_id, expires_at, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), reason = VALUES(reason), created_by = VALUES(created_by), updated_at = CURRENT_TIMESTAMP(3)`,
    [scopeType, scopeId, userId, expiresAt, reason || null, session.userId],
  );
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: scopeType === "WORKSPACE" ? scopeId : null,
    action: "community.member.timed_out",
    targetType: "user",
    targetId: userId,
    severity: "MODERATION",
    details: { scopeType, scopeId, durationMinutes, reason: reason || null },
  });

  return NextResponse.json({ success: true, expiresAt: expiresAt.toISOString() });
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid timeout target." }, { status: 400 });
  const { scopeType, scopeId, userId } = parsed.data;
  const actorAccess = await getCommunityScopeAccess(session.userId, scopeType, scopeId);
  if (!actorAccess?.canTimeoutMembers) return NextResponse.json({ error: "Chat timeout permission is required." }, { status: 403 });

  await getPool().execute(
    `DELETE FROM community_chat_timeouts WHERE scope_type = ? AND scope_id = ? AND user_id = ?`,
    [scopeType, scopeId, userId],
  );
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: scopeType === "WORKSPACE" ? scopeId : null,
    action: "community.member.timeout_removed",
    targetType: "user",
    targetId: userId,
    severity: "MODERATION",
    details: { scopeType, scopeId },
  });
  return NextResponse.json({ success: true });
}
