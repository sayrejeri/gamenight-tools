import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { canManagePlatformStaff, getPlatformRole } from "@/lib/platform-access";
import { writeAuditLog } from "@/lib/audit";

const roleSchema = z.object({ identifier: z.string().trim().min(2).max(100), role: z.enum(["OWNER", "ADMIN", "REVIEWER", "MODERATOR", "SUPPORT"]) });

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const actorRole = await getPlatformRole(session.userId);
  if (!canManagePlatformStaff(actorRole)) return NextResponse.json({ error: "Platform admin access is required." }, { status: 403 });
  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid user and staff role." }, { status: 400 });
  if (parsed.data.role === "OWNER" && actorRole !== "OWNER") return NextResponse.json({ error: "Only the platform owner can assign another owner." }, { status: 403 });

  const users = await query<(RowDataPacket & { id: string; site_username: string | null })[]>(
    `SELECT id, site_username FROM users
     WHERE LOWER(site_username) = LOWER(?) OR discord_id = ? OR LOWER(username) = LOWER(?) LIMIT 1`,
    [parsed.data.identifier, parsed.data.identifier, parsed.data.identifier],
  );
  const target = users[0];
  if (!target) return NextResponse.json({ error: "That user has not signed into Game Night Tools yet." }, { status: 404 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO platform_staff_roles (user_id, role, status, assigned_by)
       VALUES (?, ?, 'ACTIVE', ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'ACTIVE', assigned_by = VALUES(assigned_by), updated_at = CURRENT_TIMESTAMP(3)`,
      [target.id, parsed.data.role, session.userId],
    );
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'PLATFORM_ROLE_ASSIGNED', 'STAFF', 'Platform staff access updated', ?, '/dashboard/staff')`,
      [randomUUID(), target.id, `Your Game Night Tools platform role is now ${parsed.data.role.toLowerCase()}.`],
    );
  });
  await writeAuditLog({ actorUserId: session.userId, action: "platform_staff.assigned", targetType: "user", targetId: target.id, details: { role: parsed.data.role } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const actorRole = await getPlatformRole(session.userId);
  if (!canManagePlatformStaff(actorRole)) return NextResponse.json({ error: "Platform admin access is required." }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: "You cannot remove your own platform role here." }, { status: 409 });
  const targetRole = await getPlatformRole(userId);
  if (targetRole === "OWNER" && actorRole !== "OWNER") return NextResponse.json({ error: "Only the platform owner can remove an owner." }, { status: 403 });
  await withTransaction(async (connection) => {
    await connection.execute(`UPDATE platform_staff_roles SET status = 'REMOVED', updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?`, [userId]);
  });
  await writeAuditLog({ actorUserId: session.userId, action: "platform_staff.removed", targetType: "user", targetId: userId });
  return NextResponse.json({ success: true });
}
