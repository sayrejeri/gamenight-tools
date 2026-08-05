import type { RowDataPacket } from "mysql2";
import { isPlatformOwner } from "@/lib/auth";
import { query } from "@/lib/db";

export type PlatformRole = "OWNER" | "ADMIN" | "REVIEWER" | "MODERATOR" | "SUPPORT";

type PlatformRoleRow = RowDataPacket & {
  discord_id: string;
  role: PlatformRole | null;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED" | null;
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
    `SELECT u.discord_id, psr.role, psr.status
     FROM users u
     LEFT JOIN platform_staff_roles psr ON psr.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (isPlatformOwner(row.discord_id)) return "OWNER";
  return row.status === "ACTIVE" ? row.role : null;
}

export async function hasPlatformRole(userId: string, minimum: PlatformRole): Promise<boolean> {
  const role = await getPlatformRole(userId);
  return role ? roleRank[role] >= roleRank[minimum] : false;
}

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
