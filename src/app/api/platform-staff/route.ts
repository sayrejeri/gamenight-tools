import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getPlatformPermissionSnapshot, hasPlatformPermission } from "@/lib/permissions";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_DEFAULTS,
  buildPermissionOverrides,
  type PlatformPermission,
} from "@/lib/permission-catalog";

const roleEnum = z.enum(["OWNER", "ADMIN", "REVIEWER", "MODERATOR", "SUPPORT"]);
const permissionEnum = z.enum(PLATFORM_PERMISSIONS);
const assignSchema = z.object({
  identifier: z.string().trim().min(2).max(100),
  role: roleEnum,
  displayLabel: z.string().trim().max(80).optional().default(""),
  permissions: z.array(permissionEnum).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
const updateSchema = z.object({
  userId: z.string().min(1),
  role: roleEnum,
  displayLabel: z.string().trim().max(80).optional().default(""),
  permissions: z.array(permissionEnum),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  expiresAt: z.string().datetime().nullable().optional(),
  suspendedReason: z.string().trim().max(500).optional().default(""),
});

type UserRow = RowDataPacket & { id: string; site_username: string | null; discord_id: string; display_name: string };
type StaffRow = RowDataPacket & { role: string; status: string; display_label: string | null; permissions_json: string | null };

async function resolveUser(identifier: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    `SELECT CAST(id AS CHAR) AS id, site_username, discord_id, COALESCE(global_name, username) AS display_name
     FROM users WHERE LOWER(site_username) = LOWER(?) OR discord_id = ? OR LOWER(username) = LOWER(?) LIMIT 1`,
    [identifier.replace(/^@/, ""), identifier, identifier.replace(/^@/, "")],
  );
  return rows[0] ?? null;
}

async function validateActorCanSet(
  actorUserId: string,
  targetRole: string,
  selectedPermissions: readonly PlatformPermission[],
  editingPermissions: boolean,
): Promise<string | null> {
  const actor = await getPlatformPermissionSnapshot(actorUserId);
  if (!actor.permissions.includes("MANAGE_PLATFORM_STAFF")) return "Platform staff management permission is required.";
  if ((targetRole === "OWNER") && !actor.permissions.includes("MANAGE_OWNERS")) return "Only an Owner with owner-management permission can assign Owner access.";
  if (targetRole === "ADMIN" && !actor.permissions.includes("ASSIGN_HIGH_ROLES")) return "You do not have permission to assign Admin access.";
  if (editingPermissions && !actor.permissions.includes("EDIT_ACCESS_PERMISSIONS")) return "You do not have permission to customize staff permissions.";
  const actorSet = new Set(actor.permissions);
  const ungrantable = selectedPermissions.find((permission) => !actorSet.has(permission));
  if (ungrantable) return `You cannot grant ${ungrantable.replaceAll("_", " ").toLowerCase()} because you do not have that permission yourself.`;
  return null;
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid user and staff role." }, { status: 400 });

  const defaultPermissions = [...(PLATFORM_ROLE_DEFAULTS[parsed.data.role] ?? [])] as PlatformPermission[];
  const selectedPermissions = parsed.data.permissions ?? defaultPermissions;
  const permissionError = await validateActorCanSet(session.userId, parsed.data.role, selectedPermissions, Boolean(parsed.data.permissions));
  if (permissionError) return NextResponse.json({ error: permissionError }, { status: 403 });

  const target = await resolveUser(parsed.data.identifier);
  if (!target) return NextResponse.json({ error: "That user has not signed into Game Night Tools yet." }, { status: 404 });
  if (target.id === session.userId && parsed.data.role !== "OWNER") return NextResponse.json({ error: "Use another Owner to change your own high-level platform access." }, { status: 409 });

  const overrides = buildPermissionOverrides(defaultPermissions, selectedPermissions, PLATFORM_PERMISSIONS);
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO platform_staff_roles
        (user_id, role, display_label, permissions_json, status, expires_at, suspended_reason, assigned_by, last_changed_by, last_changed_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, NULL, ?, ?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE role = VALUES(role), display_label = VALUES(display_label), permissions_json = VALUES(permissions_json),
         status = 'ACTIVE', expires_at = VALUES(expires_at), suspended_reason = NULL, assigned_by = VALUES(assigned_by),
         last_changed_by = VALUES(last_changed_by), last_changed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)`,
      [target.id, parsed.data.role, parsed.data.displayLabel || null, JSON.stringify(overrides), parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, session.userId, session.userId],
    );
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'PLATFORM_ROLE_ASSIGNED', 'STAFF', 'Platform staff access updated', ?, '/dashboard/access')`,
      [randomUUID(), target.id, `Your Game Night Tools platform access is now ${parsed.data.displayLabel || parsed.data.role.toLowerCase()}.`],
    );
  });
  await writeAuditLog({
    actorUserId: session.userId,
    action: "platform_staff.assigned",
    targetType: "user",
    targetId: target.id,
    severity: parsed.data.role === "OWNER" || parsed.data.role === "ADMIN" ? "SECURITY" : "PERMISSIONS",
    sensitive: parsed.data.role === "OWNER" || parsed.data.role === "ADMIN",
    details: { role: parsed.data.role, displayLabel: parsed.data.displayLabel || null, permissions: selectedPermissions, expiresAt: parsed.data.expiresAt ?? null },
  });
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid staff access update." }, { status: 400 });
  if (parsed.data.userId === session.userId && parsed.data.status !== "ACTIVE") return NextResponse.json({ error: "You cannot suspend your own platform access." }, { status: 409 });

  const targets = await query<StaffRow[]>(
    `SELECT role, status, display_label, permissions_json FROM platform_staff_roles WHERE user_id = ? LIMIT 1`,
    [parsed.data.userId],
  );
  const target = targets[0];
  if (!target) return NextResponse.json({ error: "Platform staff member not found." }, { status: 404 });

  const permissionError = await validateActorCanSet(session.userId, parsed.data.role, parsed.data.permissions, true);
  if (permissionError) return NextResponse.json({ error: permissionError }, { status: 403 });
  if (target.role === "OWNER" && !(await hasPlatformPermission(session.userId, "MANAGE_OWNERS"))) return NextResponse.json({ error: "Owner-management permission is required to edit an Owner." }, { status: 403 });

  const defaults = [...(PLATFORM_ROLE_DEFAULTS[parsed.data.role] ?? [])] as PlatformPermission[];
  const overrides = buildPermissionOverrides(defaults, parsed.data.permissions, PLATFORM_PERMISSIONS);
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE platform_staff_roles
       SET role = ?, display_label = ?, permissions_json = ?, status = ?, expires_at = ?, suspended_reason = ?,
           last_changed_by = ?, last_changed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE user_id = ?`,
      [parsed.data.role, parsed.data.displayLabel || null, JSON.stringify(overrides), parsed.data.status,
       parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
       parsed.data.status === "SUSPENDED" ? parsed.data.suspendedReason || null : null,
       session.userId, parsed.data.userId],
    );
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'PLATFORM_ROLE_UPDATED', 'STAFF', 'Platform access changed', ?, '/dashboard/access')`,
      [randomUUID(), parsed.data.userId, parsed.data.status === "SUSPENDED" ? "Your platform staff access was suspended." : `Your platform access was updated to ${parsed.data.displayLabel || parsed.data.role.toLowerCase()}.`],
    );
  });
  await writeAuditLog({
    actorUserId: session.userId,
    action: "platform_staff.updated",
    targetType: "user",
    targetId: parsed.data.userId,
    severity: "PERMISSIONS",
    sensitive: parsed.data.role === "OWNER" || parsed.data.role === "ADMIN" || target.role === "OWNER" || target.role === "ADMIN",
    details: { previousRole: target.role, role: parsed.data.role, previousStatus: target.status, status: parsed.data.status, displayLabel: parsed.data.displayLabel || null, permissions: parsed.data.permissions, expiresAt: parsed.data.expiresAt ?? null },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await hasPlatformPermission(session.userId, "MANAGE_PLATFORM_STAFF"))) return NextResponse.json({ error: "Platform staff management permission is required." }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: "You cannot remove your own platform access here." }, { status: 409 });
  const target = await getPlatformPermissionSnapshot(userId);
  if (target.role === "OWNER" && !(await hasPlatformPermission(session.userId, "MANAGE_OWNERS"))) return NextResponse.json({ error: "Owner-management permission is required to remove an Owner." }, { status: 403 });
  if (target.role === "ADMIN" && !(await hasPlatformPermission(session.userId, "ASSIGN_HIGH_ROLES"))) return NextResponse.json({ error: "Admin-assignment permission is required to remove an Admin." }, { status: 403 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE platform_staff_roles SET status = 'REMOVED', suspended_reason = NULL, last_changed_by = ?, last_changed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?`,
      [session.userId, userId],
    );
  });
  await writeAuditLog({ actorUserId: session.userId, action: "platform_staff.removed", targetType: "user", targetId: userId, severity: target.role === "OWNER" || target.role === "ADMIN" ? "SECURITY" : "PERMISSIONS", sensitive: true, details: { previousRole: target.role } });
  return NextResponse.json({ success: true });
}
