import type { RowDataPacket } from "mysql2";
import { isPlatformOwner } from "@/lib/auth";
import { query } from "@/lib/db";

export type PlatformRole = "OWNER" | "ADMIN" | "REVIEWER" | "MODERATOR" | "SUPPORT";

type PlatformRoleRow = RowDataPacket & {
  discord_id: string;
  role: PlatformRole | null;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED" | null;
  expires_at: Date | null;
};

const roleRank: Record<PlatformRole, number> = {
  SUPPORT: 10,
  MODERATOR: 20,
  REVIEWER: 30,
  ADMIN: 40,
  OWNER: 50,
};

export async function getPlatformRole(userId: string): Promise<PlatformRole | null> {
  const rows = await query<PlatformRoleRow[]>(
    `SELECT u.discord_id, psr.role, psr.status, psr.expires_at
     FROM users u
     LEFT JOIN platform_staff_roles psr ON psr.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (isPlatformOwner(row.discord_id)) return "OWNER";
  if (row.status !== "ACTIVE" || !row.role) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row.role;
}

export async function hasPlatformRole(userId: string, minimum: PlatformRole): Promise<boolean> {
  const role = await getPlatformRole(userId);
  return role ? roleRank[role] >= roleRank[minimum] : false;
}

// Legacy role helpers remain for older routes. New v0.3.8 access-sensitive routes
// should prefer hasPlatformPermission from @/lib/permissions.
export function canReviewProfiles(role: PlatformRole | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "REVIEWER";
}

export function canModeratePlatform(role: PlatformRole | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MODERATOR";
}

export function canManagePlatformStaff(role: PlatformRole | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageSuggestions(role: PlatformRole | null): boolean {
  return Boolean(role);
}
