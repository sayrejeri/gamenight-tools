import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getWorkspaceRole } from "@/lib/access";
import { query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "STAFF", "HOST", "REFEREE", "VIEWER"]);
const addSchema = z.object({
  identifier: z.string().trim().min(2).max(100),
  role: workspaceRoleSchema,
});
const updateSchema = z.object({
  userId: z.string().min(1),
  role: workspaceRoleSchema,
});

type UserRow = RowDataPacket & {
  id: string;
  discord_id: string;
  display_name: string;
};

type MemberRow = RowDataPacket & {
  role: string;
  status: string;
};

function canManageWorkspace(role: string | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function canAssign(actorRole: string, role: string): boolean {
  if (role === "OWNER") return actorRole === "OWNER";
  if (role === "ADMIN") return actorRole === "OWNER" || actorRole === "ADMIN";
  return actorRole === "OWNER" || actorRole === "ADMIN";
}

async function resolveUser(identifier: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    `SELECT id, discord_id, COALESCE(site_username, global_name, username) AS display_name
     FROM users
     WHERE LOWER(site_username) = LOWER(?)
        OR LOWER(username) = LOWER(?)
        OR discord_id = ?
     LIMIT 1`,
    [identifier, identifier, identifier],
  );
  return rows[0] ?? null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const actorRole = await getWorkspaceRole(session.userId, workspaceId);
  if (!canManageWorkspace(actorRole)) return NextResponse.json({ error: "Server owner or admin access is required." }, { status: 403 });

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid user or Discord ID and role." }, { status: 400 });
  if (!canAssign(actorRole!, parsed.data.role)) return NextResponse.json({ error: "Only a server or platform owner can assign another owner." }, { status: 403 });

  const user = await resolveUser(parsed.data.identifier);
  const isDiscordId = /^\d{15,32}$/.test(parsed.data.identifier);

  if (!user && parsed.data.role !== "OWNER") {
    return NextResponse.json({ error: "That user has not signed into Game Night Tools yet. Only owner claims can be saved before a user's first login." }, { status: 404 });
  }
  if (!user && !isDiscordId) {
    return NextResponse.json({ error: "Enter the owner's numeric Discord ID so the claim can activate when they sign in." }, { status: 400 });
  }

  await withTransaction(async (connection) => {
    if (user) {
      await connection.execute(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status, approved_by)
         VALUES (?, ?, ?, 'ACTIVE', ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'ACTIVE', approved_by = VALUES(approved_by), updated_at = CURRENT_TIMESTAMP(3)`,
        [workspaceId, user.id, parsed.data.role, session.userId],
      );
      if (parsed.data.role === "OWNER") {
        await connection.execute(
          `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)`,
          [workspaceId, user.discord_id, session.userId],
        );
      }
      await connection.execute(
        `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
         VALUES (?, ?, 'WORKSPACE_ROLE_ASSIGNED', 'SERVERS', 'Server access updated', ?, ?)`,
        [randomUUID(), user.id, `Your server role is now ${parsed.data.role.toLowerCase()}.`, `/dashboard/workspaces/${workspaceId}`],
      );
    } else {
      await connection.execute(
        `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)`,
        [workspaceId, parsed.data.identifier, session.userId],
      );
    }
  });

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId,
    action: user ? "workspace.member.assigned" : "workspace.owner_claim.created",
    targetType: user ? "user" : "discord_id",
    targetId: user?.id ?? parsed.data.identifier,
    details: { role: parsed.data.role },
  });

  return NextResponse.json({ success: true, pendingClaim: !user, displayName: user?.display_name ?? parsed.data.identifier }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const actorRole = await getWorkspaceRole(session.userId, workspaceId);
  if (!canManageWorkspace(actorRole)) return NextResponse.json({ error: "Server owner or admin access is required." }, { status: 403 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid server role update." }, { status: 400 });
  if (!canAssign(actorRole!, parsed.data.role)) return NextResponse.json({ error: "Only a server or platform owner can assign another owner." }, { status: 403 });

  const targets = await query<MemberRow[]>(
    `SELECT role, status FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1`,
    [workspaceId, parsed.data.userId],
  );
  const target = targets[0];
  if (!target) return NextResponse.json({ error: "Server member not found." }, { status: 404 });
  if (target.role === "OWNER" && actorRole !== "OWNER") return NextResponse.json({ error: "Only an owner can change another owner's role." }, { status: 403 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE workspace_members SET role = ?, status = 'ACTIVE', approved_by = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE workspace_id = ? AND user_id = ?`,
      [parsed.data.role, session.userId, workspaceId, parsed.data.userId],
    );
  });
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "workspace.member.role_updated", targetType: "user", targetId: parsed.data.userId, details: { role: parsed.data.role } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const actorRole = await getWorkspaceRole(session.userId, workspaceId);
  if (!canManageWorkspace(actorRole)) return NextResponse.json({ error: "Server owner or admin access is required." }, { status: 403 });

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");
  if (!userId && !discordId) return NextResponse.json({ error: "Server member or owner claim is required." }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: "You cannot remove your own server access here." }, { status: 409 });

  if (userId) {
    const targets = await query<MemberRow[]>(
      `SELECT role, status FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1`,
      [workspaceId, userId],
    );
    const target = targets[0];
    if (!target) return NextResponse.json({ error: "Server member not found." }, { status: 404 });
    if (target.role === "OWNER" && actorRole !== "OWNER") return NextResponse.json({ error: "Only an owner can remove another owner." }, { status: 403 });
    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE workspace_members SET status = 'REMOVED', approved_by = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE workspace_id = ? AND user_id = ?`,
        [session.userId, workspaceId, userId],
      );
    });
    await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "workspace.member.removed", targetType: "user", targetId: userId });
  } else if (discordId) {
    if (actorRole !== "OWNER") return NextResponse.json({ error: "Only an owner can remove pending owner claims." }, { status: 403 });
    await withTransaction(async (connection) => {
      await connection.execute(`DELETE FROM workspace_owner_claims WHERE workspace_id = ? AND discord_id = ?`, [workspaceId, discordId]);
    });
    await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "workspace.owner_claim.removed", targetType: "discord_id", targetId: discordId });
  }

  return NextResponse.json({ success: true });
}
