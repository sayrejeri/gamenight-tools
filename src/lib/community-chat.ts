import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { getPool, query } from "@/lib/db";
import { getPlatformPermissionSnapshot, getWorkspacePermissionSnapshot } from "@/lib/permissions";

export type CommunityScopeType = "WORKSPACE" | "TEAM";
export type CommunityChannelType = "CHAT" | "ANNOUNCEMENT" | "STAFF";

export type CommunityScopeAccess = {
  scopeType: CommunityScopeType;
  scopeId: string;
  name: string;
  slug: string | null;
  chatEnabled: boolean;
  roleLabel: string | null;
  canRead: boolean;
  canSend: boolean;
  canManageChannels: boolean;
  canManageMessages: boolean;
  canTimeoutMembers: boolean;
  canViewStaffChannels: boolean;
  canPostAnnouncements: boolean;
};

type WorkspaceScopeRow = RowDataPacket & {
  id: string;
  name: string;
  chat_enabled: number;
  profile_status: string;
  created_by: string;
  is_guild_member: number;
  is_workspace_member: number;
};

type TeamScopeRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  chat_enabled: number;
  profile_status: string;
  owner_user_id: string;
  member_role: string | null;
  member_status: string | null;
};

type ChannelContextRow = RowDataPacket & {
  id: string;
  scope_type: CommunityScopeType;
  scope_id: string;
  name: string;
  slug: string;
  channel_type: CommunityChannelType;
  topic: string | null;
  position: number;
  slowmode_seconds: number;
  is_archived: number;
};

export async function getCommunityScopeAccess(
  userId: string,
  scopeType: CommunityScopeType,
  scopeId: string,
): Promise<CommunityScopeAccess | null> {
  if (scopeType === "WORKSPACE") {
    const rows = await query<WorkspaceScopeRow[]>(
      `SELECT w.id, w.name, w.chat_enabled, w.profile_status, CAST(w.created_by AS CHAR) AS created_by,
              EXISTS(
                SELECT 1 FROM user_guilds ug
                WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id
              ) AS is_guild_member,
              EXISTS(
                SELECT 1 FROM workspace_members wm
                WHERE wm.user_id = ? AND wm.workspace_id = w.id AND wm.status = 'ACTIVE'
                  AND (wm.expires_at IS NULL OR wm.expires_at > CURRENT_TIMESTAMP(3))
              ) AS is_workspace_member
       FROM workspaces w WHERE w.id = ? LIMIT 1`,
      [userId, userId, scopeId],
    );
    const row = rows[0];
    if (!row || row.profile_status !== "APPROVED") return null;

    const [workspaceAccess, platformAccess] = await Promise.all([
      getWorkspacePermissionSnapshot(userId, scopeId),
      getPlatformPermissionSnapshot(userId),
    ]);
    const belongsToCommunity = Boolean(row.is_guild_member || row.is_workspace_member || platformAccess.role === "OWNER");
    const permissions = belongsToCommunity ? workspaceAccess.permissions : [];

    return {
      scopeType,
      scopeId,
      name: row.name,
      slug: null,
      chatEnabled: Boolean(row.chat_enabled),
      roleLabel: workspaceAccess.displayLabel,
      canRead: Boolean(row.chat_enabled) && belongsToCommunity,
      canSend: Boolean(row.chat_enabled) && belongsToCommunity,
      canManageChannels: belongsToCommunity && permissions.includes("MANAGE_CHANNELS"),
      canManageMessages: belongsToCommunity && permissions.includes("MANAGE_MESSAGES"),
      canTimeoutMembers: belongsToCommunity && permissions.includes("TIMEOUT_MEMBERS"),
      canViewStaffChannels: belongsToCommunity && permissions.includes("VIEW_STAFF_CHANNELS"),
      canPostAnnouncements: belongsToCommunity && permissions.includes("POST_ANNOUNCEMENTS"),
    };
  }

  const rows = await query<TeamScopeRow[]>(
    `SELECT t.id, t.name, t.slug, t.chat_enabled, t.profile_status, CAST(t.owner_user_id AS CHAR) AS owner_user_id,
            tm.role AS member_role, tm.status AS member_status
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
     WHERE t.id = ? LIMIT 1`,
    [userId, scopeId],
  );
  const row = rows[0];
  if (!row || row.profile_status !== "APPROVED") return null;

  const activeMember = row.member_status === "ACTIVE";
  const role = row.member_role;
  const manager = activeMember && Boolean(role && ["OWNER", "MANAGER"].includes(role));
  const moderator = activeMember && Boolean(role && ["OWNER", "MANAGER", "CAPTAIN"].includes(role));
  const teamStaff = activeMember && Boolean(role && ["OWNER", "MANAGER", "CAPTAIN", "COACH"].includes(role));

  return {
    scopeType,
    scopeId,
    name: row.name,
    slug: row.slug,
    chatEnabled: Boolean(row.chat_enabled),
    roleLabel: role,
    canRead: Boolean(row.chat_enabled) && activeMember,
    canSend: Boolean(row.chat_enabled) && activeMember,
    canManageChannels: manager,
    canManageMessages: moderator,
    canTimeoutMembers: manager,
    canViewStaffChannels: teamStaff,
    canPostAnnouncements: moderator,
  };
}

export function canViewChannel(access: CommunityScopeAccess, channelType: CommunityChannelType): boolean {
  if (!access.canRead && !access.canManageChannels) return false;
  if (channelType === "STAFF") return access.canViewStaffChannels || access.canManageChannels;
  return access.canRead || access.canManageChannels;
}

export function canSendToChannel(access: CommunityScopeAccess, channelType: CommunityChannelType): boolean {
  if (!access.canSend) return false;
  if (channelType === "STAFF") return access.canViewStaffChannels;
  if (channelType === "ANNOUNCEMENT") return access.canPostAnnouncements;
  return true;
}

export async function getCommunityChannelContext(userId: string, channelId: string) {
  const rows = await query<ChannelContextRow[]>(
    `SELECT id, scope_type, scope_id, name, slug, channel_type, topic, position, slowmode_seconds, is_archived
     FROM community_channels WHERE id = ? LIMIT 1`,
    [channelId],
  );
  const channel = rows[0];
  if (!channel || channel.is_archived) return null;
  const access = await getCommunityScopeAccess(userId, channel.scope_type, channel.scope_id);
  if (!access || !canViewChannel(access, channel.channel_type)) return null;
  return { channel, access };
}

export async function getActiveCommunityTimeout(userId: string, scopeType: CommunityScopeType, scopeId: string) {
  const rows = await query<(RowDataPacket & { expires_at: Date; reason: string | null })[]>(
    `SELECT expires_at, reason FROM community_chat_timeouts
     WHERE scope_type = ? AND scope_id = ? AND user_id = ? AND expires_at > CURRENT_TIMESTAMP(3)
     LIMIT 1`,
    [scopeType, scopeId, userId],
  );
  return rows[0] ?? null;
}

export async function ensureDefaultCommunityChannels(scopeType: CommunityScopeType, scopeId: string): Promise<void> {
  const ownerRows = scopeType === "WORKSPACE"
    ? await query<(RowDataPacket & { owner_user_id: string })[]>(
        `SELECT CAST(created_by AS CHAR) AS owner_user_id FROM workspaces WHERE id = ? LIMIT 1`,
        [scopeId],
      )
    : await query<(RowDataPacket & { owner_user_id: string })[]>(
        `SELECT CAST(owner_user_id AS CHAR) AS owner_user_id FROM teams WHERE id = ? LIMIT 1`,
        [scopeId],
      );
  const ownerUserId = ownerRows[0]?.owner_user_id;
  if (!ownerUserId) return;

  const pool = getPool();
  await pool.execute(
    `INSERT IGNORE INTO community_channels
      (id, scope_type, scope_id, name, slug, channel_type, topic, position, created_by)
     VALUES (?, ?, ?, 'General', 'general', 'CHAT', ?, 0, ?)`,
    [randomUUID(), scopeType, scopeId, scopeType === "WORKSPACE" ? "General community conversation" : "Team conversation", ownerUserId],
  );
  await pool.execute(
    `INSERT IGNORE INTO community_channels
      (id, scope_type, scope_id, name, slug, channel_type, topic, position, created_by)
     VALUES (?, ?, ?, 'Announcements', 'announcements', 'ANNOUNCEMENT', ?, 1, ?)`,
    [randomUUID(), scopeType, scopeId, scopeType === "WORKSPACE" ? "Official server announcements" : "Official team announcements", ownerUserId],
  );
}

export function communityScopePath(scopeType: CommunityScopeType, scopeId: string): string {
  return `/dashboard/community/${scopeType === "WORKSPACE" ? "servers" : "teams"}/${scopeId}`;
}

export function makeChannelSlug(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return slug || "channel";
}
