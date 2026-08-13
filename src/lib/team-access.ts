import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export type TeamRole = "OWNER" | "MANAGER" | "CAPTAIN" | "PLAYER" | "SUBSTITUTE" | "COACH";

type TeamRoleRow = RowDataPacket & { role: TeamRole };

export async function getActiveTeamRole(userId: string | number, teamId: string): Promise<TeamRole | null> {
  const rows = await query<TeamRoleRow[]>(
    `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [teamId, userId],
  );
  return rows[0]?.role ?? null;
}

export function canManageTeamIdentity(role: TeamRole | null): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function canManageTeamPrivateServer(role: TeamRole | null): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "CAPTAIN";
}

export function normalizeRobloxPrivateServerUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try { parsed = new URL(trimmed); }
  catch { throw new Error("Enter a valid Roblox private server URL."); }

  const host = parsed.hostname.toLowerCase();
  const isRobloxHost = host === "roblox.com" || host.endsWith(".roblox.com");
  if (parsed.protocol !== "https:" || !isRobloxHost) {
    throw new Error("Private server links must use an https://roblox.com address.");
  }

  const privateServerLinkCode = parsed.searchParams.get("privateServerLinkCode");
  const shareCode = parsed.searchParams.get("code");
  const shareType = parsed.searchParams.get("type")?.toLowerCase();
  const isPrivateGameLink = Boolean(privateServerLinkCode);
  const isPrivateShareLink = parsed.pathname.toLowerCase().includes("/share") && Boolean(shareCode) && shareType === "server";
  if (!isPrivateGameLink && !isPrivateShareLink) {
    throw new Error("Use the Roblox private-server invite/share link, not a normal game page.");
  }

  return parsed.toString();
}
