import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { getPlatformPermissionSnapshot, hasPlatformPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const moderationSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
  clearBio: z.boolean().default(false),
  clearBanner: z.boolean().default(false),
  hideProfile: z.boolean().default(false),
  note: z.string().trim().max(1000).optional().default(""),
});

type UserRow = RowDataPacket & { discord_id: string; site_username: string | null; account_status: string };

export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await hasPlatformPermission(session.userId, "MODERATE_USERS"))) return NextResponse.json({ error: "User-moderation permission is required." }, { status: 403 });

  const parsed = moderationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid moderation action." }, { status: 400 });
  const { userId } = await context.params;
  if (userId === session.userId && parsed.data.accountStatus !== "ACTIVE") return NextResponse.json({ error: "You cannot suspend or ban your own platform account." }, { status: 409 });

  const users = await query<UserRow[]>(`SELECT discord_id, site_username, account_status FROM users WHERE id = ? LIMIT 1`, [userId]);
  const target = users[0];
  if (!target) return NextResponse.json({ error: "Website user not found." }, { status: 404 });

  const [actorAccess, targetAccess] = await Promise.all([
    getPlatformPermissionSnapshot(session.userId),
    getPlatformPermissionSnapshot(userId),
  ]);
  if (targetAccess.role === "OWNER" && !actorAccess.permissions.includes("MANAGE_OWNERS")) return NextResponse.json({ error: "Owner-management permission is required to moderate an Owner account." }, { status: 403 });
  if (targetAccess.role === "ADMIN" && !actorAccess.permissions.includes("ASSIGN_HIGH_ROLES")) return NextResponse.json({ error: "High-level staff permission is required to suspend or ban an Admin account." }, { status: 403 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE users SET account_status = ?, bio = IF(? = 1, NULL, bio), banner_url = IF(? = 1, NULL, banner_url),
           profile_visibility = IF(? = 1 OR ? <> 'ACTIVE', 'PRIVATE', profile_visibility), updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [parsed.data.accountStatus, parsed.data.clearBio ? 1 : 0, parsed.data.clearBanner ? 1 : 0,
       parsed.data.hideProfile ? 1 : 0, parsed.data.accountStatus, userId],
    );
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "platform_user.moderated",
    targetType: "user",
    targetId: userId,
    severity: "MODERATION",
    sensitive: parsed.data.accountStatus === "BANNED" || targetAccess.role === "OWNER" || targetAccess.role === "ADMIN",
    details: { previousStatus: target.account_status, accountStatus: parsed.data.accountStatus, clearBio: parsed.data.clearBio,
      clearBanner: parsed.data.clearBanner, hideProfile: parsed.data.hideProfile, note: parsed.data.note || null },
  });

  return NextResponse.json({ success: true });
}
