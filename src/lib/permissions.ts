import type { RowDataPacket } from "mysql2";
import { isPlatformOwner } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_DEFAULTS,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLE_DEFAULTS,
  getEffectivePermissions,
  parsePermissionOverrides,
  type PlatformPermission,
  type WorkspacePermission,
} from "@/lib/permission-catalog";

type PlatformAccessRow = RowDataPacket & {
  discord_id: string;
  role: string | null;
  display_label: string | null;
  status: string | null;
  permissions_json: string | null;
  expires_at: Date | null;
};

type WorkspaceAccessRow = RowDataPacket & {
  discord_id: string;
  workspace_role: string | null;
  workspace_display_label: string | null;
  workspace_status: string | null;
  workspace_permissions_json: string | null;
  workspace_expires_at: Date | null;
  platform_role: string | null;
  platform_status: string | null;
  platform_permissions_json: string | null;
  platform_expires_at: Date | null;
};

type WorkspacePermissionSource = "WORKSPACE" | "PLATFORM" | "BOTH" | null;

function isExpired(value: Date | null): boolean {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

export async function getPlatformPermissionSnapshot(userId: string) {
  const rows = await query<PlatformAccessRow[]>(
    `SELECT u.discord_id, psr.role, psr.display_label, psr.status, psr.permissions_json, psr.expires_at
     FROM users u
     LEFT JOIN platform_staff_roles psr ON psr.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return { role: null, displayLabel: null, status: null, permissions: [] as PlatformPermission[], expiresAt: null as Date | null };
  if (isPlatformOwner(row.discord_id)) {
    return { role: "OWNER", displayLabel: "Owner", status: "ACTIVE", permissions: [...PLATFORM_PERMISSIONS], expiresAt: null };
  }
  if (!row.role || row.status !== "ACTIVE" || isExpired(row.expires_at)) {
    return { role: row.role, displayLabel: row.display_label, status: row.status, permissions: [] as PlatformPermission[], expiresAt: row.expires_at };
  }
  const defaults = PLATFORM_ROLE_DEFAULTS[row.role] ?? [];
  const overrides = parsePermissionOverrides(row.permissions_json, PLATFORM_PERMISSIONS);
  return {
    role: row.role,
    displayLabel: row.display_label ?? row.role,
    status: row.status,
    permissions: getEffectivePermissions(defaults, overrides, PLATFORM_PERMISSIONS),
    expiresAt: row.expires_at,
  };
}

export async function hasPlatformPermission(userId: string, permission: PlatformPermission): Promise<boolean> {
  const access = await getPlatformPermissionSnapshot(userId);
  return access.permissions.includes(permission);
}

export async function getWorkspacePermissionSnapshot(userId: string, workspaceId: string) {
  const rows = await query<WorkspaceAccessRow[]>(
    `SELECT u.discord_id,
            wm.role AS workspace_role, wm.display_label AS workspace_display_label,
            wm.status AS workspace_status, wm.permissions_json AS workspace_permissions_json,
            wm.expires_at AS workspace_expires_at,
            psr.role AS platform_role, psr.status AS platform_status,
            psr.permissions_json AS platform_permissions_json, psr.expires_at AS platform_expires_at
     FROM users u
     LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
     LEFT JOIN platform_staff_roles psr ON psr.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [workspaceId, userId],
  );
  const row = rows[0];
  if (!row) return { role: null, displayLabel: null, status: null, permissions: [] as WorkspacePermission[], expiresAt: null as Date | null, source: null as WorkspacePermissionSource };

  if (isPlatformOwner(row.discord_id)) {
    return { role: "OWNER", displayLabel: "Platform Owner", status: "ACTIVE", permissions: [...WORKSPACE_PERMISSIONS], expiresAt: null, source: "PLATFORM" as WorkspacePermissionSource };
  }

  const directActive = Boolean(row.workspace_role && row.workspace_status === "ACTIVE" && !isExpired(row.workspace_expires_at));
  const directPermissions: WorkspacePermission[] = directActive && row.workspace_role
    ? getEffectivePermissions(
        WORKSPACE_ROLE_DEFAULTS[row.workspace_role] ?? [],
        parsePermissionOverrides(row.workspace_permissions_json, WORKSPACE_PERMISSIONS),
        WORKSPACE_PERMISSIONS,
      )
    : [];

  let platformWorkspacePermissions: WorkspacePermission[] = [];
  let platformOwner = false;
  const platformActive = Boolean(row.platform_role && row.platform_status === "ACTIVE" && !isExpired(row.platform_expires_at));
  if (platformActive && row.platform_role) {
    const platformPermissions = getEffectivePermissions(
      PLATFORM_ROLE_DEFAULTS[row.platform_role] ?? [],
      parsePermissionOverrides(row.platform_permissions_json, PLATFORM_PERMISSIONS),
      PLATFORM_PERMISSIONS,
    );
    platformOwner = row.platform_role === "OWNER";
    if (platformOwner) platformWorkspacePermissions = [...WORKSPACE_PERMISSIONS];
    else if (platformPermissions.includes("MANAGE_SERVERS")) platformWorkspacePermissions = [...(WORKSPACE_ROLE_DEFAULTS.ADMIN ?? [])] as WorkspacePermission[];
  }

  const combined = WORKSPACE_PERMISSIONS.filter((permission) => directPermissions.includes(permission) || platformWorkspacePermissions.includes(permission));
  const source: WorkspacePermissionSource = directPermissions.length && platformWorkspacePermissions.length
    ? "BOTH"
    : directPermissions.length
      ? "WORKSPACE"
      : platformWorkspacePermissions.length
        ? "PLATFORM"
        : null;

  if (combined.length) {
    return {
      role: platformOwner ? "OWNER" : row.workspace_role ?? (platformWorkspacePermissions.length ? "ADMIN" : null),
      displayLabel: row.workspace_display_label ?? (platformOwner ? "Platform Owner" : platformWorkspacePermissions.length ? "Platform Admin" : row.workspace_role),
      status: "ACTIVE",
      permissions: combined,
      expiresAt: row.workspace_expires_at ?? row.platform_expires_at,
      source,
    };
  }

  return { role: row.workspace_role, displayLabel: row.workspace_display_label, status: row.workspace_status, permissions: [] as WorkspacePermission[], expiresAt: row.workspace_expires_at, source: null as WorkspacePermissionSource };
}

export async function hasWorkspacePermission(userId: string, workspaceId: string, permission: WorkspacePermission): Promise<boolean> {
  const access = await getWorkspacePermissionSnapshot(userId, workspaceId);
  return access.permissions.includes(permission);
}
