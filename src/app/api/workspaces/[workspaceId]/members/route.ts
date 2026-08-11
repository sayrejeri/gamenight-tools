import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getWorkspacePermissionSnapshot, hasWorkspacePermission } from "@/lib/permissions";
import {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLE_DEFAULTS,
  buildPermissionOverrides,
  type WorkspacePermission,
} from "@/lib/permission-catalog";

const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "STAFF", "HOST", "REFEREE", "VIEWER"]);
const permissionEnum = z.enum(WORKSPACE_PERMISSIONS);
const addSchema = z.object({
  identifier: z.string().trim().min(2).max(100),
  role: workspaceRoleSchema,
  displayLabel: z.string().trim().max(80).optional().default(""),
  permissions: z.array(permissionEnum).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(500).optional().default(""),
});
const updateSchema = z.object({
  userId: z.string().min(1),
  role: workspaceRoleSchema,
  displayLabel: z.string().trim().max(80).optional().default(""),
  permissions: z.array(permissionEnum),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  expiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(500).optional().default(""),
});

type UserRow = RowDataPacket & { id: string; discord_id: string; display_name: string };
type MemberRow = RowDataPacket & { role: string; status: string; discord_id: string; display_label: string | null; permissions_json: string | null };
type WorkspaceRow = RowDataPacket & { name: string };
type CountRow = RowDataPacket & { total: number };
type UserResolution = { user: UserRow | null; ambiguous: boolean };

async function resolveUser(identifier: string): Promise<UserResolution> {
  const raw = identifier.trim();
  const clean = raw.replace(/^@/, "");

  // Numeric Discord IDs are authoritative and must never collide with an
  // unrelated numeric site username.
  if (/^\d{15,32}$/.test(raw)) {
    const rows = await query<UserRow[]>(
      `SELECT CAST(id AS CHAR) AS id, discord_id, COALESCE(site_username, global_name, username) AS display_name
       FROM users WHERE discord_id = ? LIMIT 2`,
      [raw],
    );
    return { user: rows[0] ?? null, ambiguous: rows.length > 1 };
  }

  const rows = await query<UserRow[]>(
    `SELECT CAST(id AS CHAR) AS id, discord_id, COALESCE(site_username, global_name, username) AS display_name
     FROM users
     WHERE LOWER(site_username) = LOWER(?) OR LOWER(username) = LOWER(?)
     LIMIT 3`,
    [clean, clean],
  );
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  return { user: unique.length === 1 ? unique[0] : null, ambiguous: unique.length > 1 };
}

async function getWorkspaceName(workspaceId: string): Promise<string | null> {
  const rows = await query<WorkspaceRow[]>(`SELECT name FROM workspaces WHERE id = ? LIMIT 1`, [workspaceId]);
  return rows[0]?.name ?? null;
}

async function hasAnotherOwner(workspaceId: string, targetDiscordId: string): Promise<boolean> {
  const rows = await query<CountRow[]>(
    `SELECT COUNT(DISTINCT owner_id) AS total FROM (
       SELECT u.discord_id AS owner_id
       FROM workspace_members wm INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ? AND wm.role = 'OWNER' AND wm.status = 'ACTIVE'
         AND (wm.expires_at IS NULL OR wm.expires_at > CURRENT_TIMESTAMP(3))
       UNION
       SELECT claim.discord_id AS owner_id FROM workspace_owner_claims claim WHERE claim.workspace_id = ?
     ) owners WHERE owner_id <> ?`,
    [workspaceId, workspaceId, targetDiscordId],
  );
  return Number(rows[0]?.total ?? 0) > 0;
}

async function validateActorCanSet(
  actorUserId: string,
  workspaceId: string,
  role: string,
  selectedPermissions: readonly WorkspacePermission[],
  editingPermissions: boolean,
): Promise<string | null> {
  const actor = await getWorkspacePermissionSnapshot(actorUserId, workspaceId);
  if (!actor.permissions.includes("MANAGE_MEMBERS")) return "Server member-management permission is required.";
  if (role === "OWNER" && !actor.permissions.includes("MANAGE_OWNERS")) return "Only an Owner with owner-management permission can assign Owner access.";
  if (role === "ADMIN" && !actor.permissions.includes("ASSIGN_HIGH_ROLES")) return "You do not have permission to assign Admin access.";
  if (!["OWNER", "ADMIN"].includes(role) && !actor.permissions.includes("ASSIGN_LOW_ROLES")) return "You do not have permission to assign server roles.";
  if (editingPermissions && !actor.permissions.includes("EDIT_ACCESS_PERMISSIONS")) return "You do not have permission to customize individual access.";
  const actorSet = new Set(actor.permissions);
  const ungrantable = selectedPermissions.find((permission) => !actorSet.has(permission));
  if (ungrantable) return `You cannot grant ${ungrantable.replaceAll("_", " ").toLowerCase()} because you do not have that permission yourself.`;
  return null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const workspaceName = await getWorkspaceName(workspaceId);
  if (!workspaceName) return NextResponse.json({ error: "Server profile not found." }, { status: 404 });
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid user, role, and access settings." }, { status: 400 });

  const defaults = [...(WORKSPACE_ROLE_DEFAULTS[parsed.data.role] ?? [])] as WorkspacePermission[];
  const selected = parsed.data.permissions ?? defaults;
  const permissionError = await validateActorCanSet(session.userId, workspaceId, parsed.data.role, selected, Boolean(parsed.data.permissions));
  if (permissionError) return NextResponse.json({ error: permissionError }, { status: 403 });

  const resolution = await resolveUser(parsed.data.identifier);
  if (resolution.ambiguous) return NextResponse.json({ error: "That identifier matches more than one account. Use the member's numeric Discord ID or exact site username." }, { status: 409 });
  const user = resolution.user;
  const isDiscordId = /^\d{15,32}$/.test(parsed.data.identifier);
  if (!user && parsed.data.role !== "OWNER") return NextResponse.json({ error: "That user has not signed into Game Night Tools yet. Only an Owner claim can be saved before first login." }, { status: 404 });
  if (!user && !isDiscordId) return NextResponse.json({ error: "Enter the Owner's numeric Discord ID so the claim can activate after their first login." }, { status: 400 });
  if (user?.id === session.userId && parsed.data.role !== "OWNER") return NextResponse.json({ error: "Another Owner must change your own high-level server access." }, { status: 409 });

  const overrides = buildPermissionOverrides(defaults, selected, WORKSPACE_PERMISSIONS);
  await withTransaction(async (connection) => {
    if (user) {
      await connection.execute(
        `INSERT INTO workspace_members
          (workspace_id, user_id, role, display_label, permissions_json, status, expires_at, notes, approved_by, last_changed_by, last_changed_at)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE role = VALUES(role), display_label = VALUES(display_label), permissions_json = VALUES(permissions_json),
           status = 'ACTIVE', expires_at = VALUES(expires_at), notes = VALUES(notes), approved_by = VALUES(approved_by),
           last_changed_by = VALUES(last_changed_by), last_changed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)`,
        [workspaceId, user.id, parsed.data.role, parsed.data.displayLabel || null, JSON.stringify(overrides),
         parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, parsed.data.notes || null, session.userId, session.userId],
      );
      if (parsed.data.role === "OWNER") {
        await connection.execute(
          `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)`,
          [workspaceId, user.discord_id, session.userId],
        );
      } else {
        await connection.execute(`DELETE FROM workspace_owner_claims WHERE workspace_id = ? AND discord_id = ?`, [workspaceId, user.discord_id]);
      }
      await connection.execute(
        `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
         VALUES (?, ?, 'WORKSPACE_ROLE_ASSIGNED', 'SERVERS', ?, ?, ?)`,
        [randomUUID(), user.id, `${workspaceName} access updated`, `Your access for ${workspaceName} is now ${parsed.data.displayLabel || parsed.data.role.toLowerCase()}.`, `/dashboard/workspaces/${workspaceId}`],
      );
    } else {
      await connection.execute(
        `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by) VALUES (?, ?, ?)
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
    severity: parsed.data.role === "OWNER" || parsed.data.role === "ADMIN" ? "SECURITY" : "PERMISSIONS",
    sensitive: parsed.data.role === "OWNER" || parsed.data.role === "ADMIN",
    details: { role: parsed.data.role, displayLabel: parsed.data.displayLabel || null, permissions: selected, expiresAt: parsed.data.expiresAt ?? null },
  });
  return NextResponse.json({ success: true, pendingClaim: !user, displayName: user?.display_name ?? parsed.data.identifier }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const workspaceName = await getWorkspaceName(workspaceId);
  if (!workspaceName) return NextResponse.json({ error: "Server profile not found." }, { status: 404 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid server access update." }, { status: 400 });
  if (parsed.data.userId === session.userId && parsed.data.status !== "ACTIVE") return NextResponse.json({ error: "You cannot suspend your own server access." }, { status: 409 });

  const targets = await query<MemberRow[]>(
    `SELECT wm.role, wm.status, wm.display_label, wm.permissions_json, u.discord_id
     FROM workspace_members wm INNER JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ? AND wm.user_id = ? LIMIT 1`,
    [workspaceId, parsed.data.userId],
  );
  const target = targets[0];
  if (!target) return NextResponse.json({ error: "Server member not found." }, { status: 404 });

  const permissionError = await validateActorCanSet(session.userId, workspaceId, parsed.data.role, parsed.data.permissions, true);
  if (permissionError) return NextResponse.json({ error: permissionError }, { status: 403 });
  if (target.role === "OWNER" && !(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_OWNERS"))) return NextResponse.json({ error: "Owner-management permission is required to edit an Owner." }, { status: 403 });
  if (target.role === "OWNER" && parsed.data.role !== "OWNER" && !(await hasAnotherOwner(workspaceId, target.discord_id))) return NextResponse.json({ error: "This is the last Owner. Add another Owner before demoting this account." }, { status: 409 });

  const defaults = [...(WORKSPACE_ROLE_DEFAULTS[parsed.data.role] ?? [])] as WorkspacePermission[];
  const overrides = buildPermissionOverrides(defaults, parsed.data.permissions, WORKSPACE_PERMISSIONS);
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE workspace_members
       SET role = ?, display_label = ?, permissions_json = ?, status = ?, expires_at = ?, notes = ?, approved_by = ?,
           last_changed_by = ?, last_changed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE workspace_id = ? AND user_id = ?`,
      [parsed.data.role, parsed.data.displayLabel || null, JSON.stringify(overrides), parsed.data.status,
       parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, parsed.data.notes || null,
       session.userId, session.userId, workspaceId, parsed.data.userId],
    );
    if (parsed.data.role === "OWNER") {
      await connection.execute(
        `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)`,
        [workspaceId, target.discord_id, session.userId],
      );
    } else {
      await connection.execute(`DELETE FROM workspace_owner_claims WHERE workspace_id = ? AND discord_id = ?`, [workspaceId, target.discord_id]);
    }
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'WORKSPACE_ROLE_UPDATED', 'SERVERS', ?, ?, ?)`,
      [randomUUID(), parsed.data.userId, `${workspaceName} access changed`, parsed.data.status === "SUSPENDED" ? `Your access for ${workspaceName} was suspended.` : `Your access for ${workspaceName} is now ${parsed.data.displayLabel || parsed.data.role.toLowerCase()}.`, `/dashboard/workspaces/${workspaceId}`],
    );
  });
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId,
    action: "workspace.member.updated",
    targetType: "user",
    targetId: parsed.data.userId,
    severity: "PERMISSIONS",
    sensitive: target.role === "OWNER" || target.role === "ADMIN" || parsed.data.role === "OWNER" || parsed.data.role === "ADMIN",
    details: { previousRole: target.role, role: parsed.data.role, previousStatus: target.status, status: parsed.data.status, displayLabel: parsed.data.displayLabel || null, permissions: parsed.data.permissions, expiresAt: parsed.data.expiresAt ?? null },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_MEMBERS"))) return NextResponse.json({ error: "Server member-management permission is required." }, { status: 403 });
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const discordId = url.searchParams.get("discordId");
  if (!userId && !discordId) return NextResponse.json({ error: "Server member or Owner claim is required." }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: "You cannot remove your own server access here." }, { status: 409 });

  if (userId) {
    const targets = await query<MemberRow[]>(
      `SELECT wm.role, wm.status, wm.display_label, wm.permissions_json, u.discord_id
       FROM workspace_members wm INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ? AND wm.user_id = ? LIMIT 1`,
      [workspaceId, userId],
    );
    const target = targets[0];
    if (!target) return NextResponse.json({ error: "Server member not found." }, { status: 404 });
    if (target.role === "OWNER") {
      if (!(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_OWNERS"))) return NextResponse.json({ error: "Owner-management permission is required to remove an Owner." }, { status: 403 });
      if (!(await hasAnotherOwner(workspaceId, target.discord_id))) return NextResponse.json({ error: "This is the last Owner. Add another Owner before removing this account." }, { status: 409 });
    }
    if (target.role === "ADMIN" && !(await hasWorkspacePermission(session.userId, workspaceId, "ASSIGN_HIGH_ROLES"))) return NextResponse.json({ error: "Admin-assignment permission is required to remove an Admin." }, { status: 403 });
    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE workspace_members SET status = 'REMOVED', approved_by = ?, last_changed_by = ?, last_changed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
         WHERE workspace_id = ? AND user_id = ?`,
        [session.userId, session.userId, workspaceId, userId],
      );
      await connection.execute(`DELETE FROM workspace_owner_claims WHERE workspace_id = ? AND discord_id = ?`, [workspaceId, target.discord_id]);
    });
    await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "workspace.member.removed", targetType: "user", targetId: userId, severity: target.role === "OWNER" || target.role === "ADMIN" ? "SECURITY" : "PERMISSIONS", sensitive: true, details: { previousRole: target.role } });
  } else if (discordId) {
    if (!(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_OWNERS"))) return NextResponse.json({ error: "Owner-management permission is required to remove pending Owner claims." }, { status: 403 });
    if (!(await hasAnotherOwner(workspaceId, discordId))) return NextResponse.json({ error: "This is the last Owner claim. Add another Owner before removing it." }, { status: 409 });
    await withTransaction(async (connection) => {
      await connection.execute(`DELETE FROM workspace_owner_claims WHERE workspace_id = ? AND discord_id = ?`, [workspaceId, discordId]);
    });
    await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "workspace.owner_claim.removed", targetType: "discord_id", targetId: discordId, severity: "SECURITY", sensitive: true });
  }
  return NextResponse.json({ success: true });
}
