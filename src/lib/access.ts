import type { RowDataPacket } from "mysql2";
import { isPlatformOwner } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPlatformRole } from "@/lib/platform-access";
import type { WorkspaceRole } from "@/lib/types";

const roleRank: Record<WorkspaceRole, number> = {
  VIEWER: 10,
  REFEREE: 20,
  HOST: 30,
  STAFF: 40,
  ADMIN: 50,
  OWNER: 60,
};

type MembershipRow = RowDataPacket & {
  discord_id: string;
  role: WorkspaceRole | null;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED" | null;
  expires_at: Date | null;
};

export async function getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const rows = await query<MembershipRow[]>(
    `SELECT u.discord_id, wm.role, wm.status, wm.expires_at
     FROM users u
     LEFT JOIN workspace_members wm
       ON wm.user_id = u.id AND wm.workspace_id = ?
     WHERE u.id = ? LIMIT 1`,
    [workspaceId, userId],
  );

  const row = rows[0];
  if (!row) return null;
  if (isPlatformOwner(row.discord_id)) return "OWNER";
  if (row.status === "ACTIVE" && row.role && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now())) return row.role;

  const platformRole = await getPlatformRole(userId);
  if (platformRole === "OWNER") return "OWNER";
  if (platformRole === "ADMIN") return "ADMIN";
  return null;
}

export async function hasWorkspaceRole(
  userId: string,
  workspaceId: string,
  minimumRole: WorkspaceRole,
): Promise<boolean> {
  const role = await getWorkspaceRole(userId, workspaceId);
  return role ? roleRank[role] >= roleRank[minimumRole] : false;
}

// Legacy role helpers remain for routes not yet converted to granular capability checks.
export function canHost(role: WorkspaceRole | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "STAFF" || role === "HOST";
}

export function canManageCodes(role: WorkspaceRole | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "STAFF";
}
