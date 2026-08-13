import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { slugifyProfileName } from "@/lib/profile";
import { resolveRobloxGame } from "@/lib/roblox";
import { hasWorkspacePermission } from "@/lib/permissions";
import { isServerProfileApprovalRequired } from "@/lib/platform-settings";
import { writeAuditLog } from "@/lib/audit";

const requestSchema = z.object({
  requestType: z.enum(["SERVER", "TEAM"]), name: z.string().trim().min(3).max(120), slug: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""), logoUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  bannerUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""), mainPlatform: z.string().trim().max(80).optional().default(""),
  mainGame: z.string().trim().max(191).optional().default(""), discordGuildId: z.string().trim().max(32).optional().default(""),
  discordInviteUrl: z.string().url().max(500).or(z.literal("")).optional().default(""), robloxCommunityUrl: z.string().url().max(500).or(z.literal("")).optional().default(""),
  homeWorkspaceId: z.string().uuid().or(z.literal("")).optional().default(""), teamTag: z.string().trim().max(16).optional().default(""), region: z.string().trim().max(80).optional().default(""),
});

const fieldLabels: Record<string, string> = {
  requestType: "profile type", name: "profile name", slug: "profile URL", description: "description", logoUrl: "logo URL",
  bannerUrl: "banner URL", mainPlatform: "main platform", mainGame: "main game", discordGuildId: "Discord server",
  discordInviteUrl: "Discord invite", robloxCommunityUrl: "Roblox community URL", homeWorkspaceId: "affiliated server", teamTag: "team tag", region: "region",
};

type ManagedGuild = RowDataPacket & { guild_id: string; guild_name: string; icon_hash: string | null; is_owner: number; permissions_value: string };
type PreferenceRow = RowDataPacket & { timezone: string | null };

function canManageDiscordGuild(isOwner: number, permissionsValue: string): boolean {
  if (isOwner) return true;
  try {
    const permissions = BigInt(permissionsValue || "0");
    return Boolean((permissions & (1n << 3n)) || (permissions & (1n << 5n)));
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = typeof issue?.path[0] === "string" ? issue.path[0] : null;
    const label = field ? fieldLabels[field] ?? "profile request" : "profile request";
    return NextResponse.json({ error: `Please check the ${label}. ${issue?.message ?? "One of the fields is invalid."}` }, { status: 400 });
  }
  const data = parsed.data;
  let managedGuild: ManagedGuild | null = null;

  if (data.requestType === "SERVER") {
    if (!data.discordGuildId) return NextResponse.json({ error: "Select a Discord server you own or manage." }, { status: 400 });
    const guilds = await query<ManagedGuild[]>(
      `SELECT guild_id, guild_name, icon_hash, is_owner, permissions_value FROM user_guilds WHERE user_id = ? AND guild_id = ? LIMIT 1`,
      [session.userId, data.discordGuildId],
    );
    managedGuild = guilds[0] ?? null;
    if (!managedGuild) return NextResponse.json({ error: "That Discord server was not found in your authorized server list." }, { status: 403 });
    if (!canManageDiscordGuild(managedGuild.is_owner, managedGuild.permissions_value)) return NextResponse.json({ error: "You must own the Discord server or have Manage Server permission to request its profile." }, { status: 403 });
    const duplicates = await query<RowDataPacket[]>(
      `SELECT id FROM workspaces WHERE discord_guild_id = ? UNION ALL SELECT id FROM profile_requests
       WHERE request_type = 'SERVER' AND discord_guild_id = ? AND status IN ('PENDING', 'APPROVED') LIMIT 1`, [data.discordGuildId, data.discordGuildId],
    );
    if (duplicates[0]) return NextResponse.json({ error: "That Discord server already has a profile or an active request." }, { status: 409 });
  }

  const requestedSlug = slugifyProfileName(data.slug || data.name);
  if (data.requestType === "TEAM") {
    const duplicates = await query<RowDataPacket[]>(
      `SELECT id FROM teams WHERE slug = ? UNION ALL SELECT id FROM profile_requests
       WHERE request_type = 'TEAM' AND requested_slug = ? AND status IN ('PENDING', 'APPROVED') LIMIT 1`, [requestedSlug, requestedSlug],
    );
    if (duplicates[0]) return NextResponse.json({ error: "That team URL is already in use or under review." }, { status: 409 });
    if (data.homeWorkspaceId && !(await hasWorkspacePermission(session.userId, data.homeWorkspaceId, "MANAGE_TEAMS"))) {
      return NextResponse.json({ error: "Team-management permission is required to affiliate a new team with that server profile." }, { status: 403 });
    }
  }

  let mainGame = data.mainGame || null;
  let robloxGame: { placeId: string; universeId: string | null; gameUrl: string; thumbnailUrl: string | null } | null = null;
  const robloxInputLooksResolvable = /^\d{4,20}$/.test(data.mainGame) || /roblox\.com\/(?:games\/|.*placeId=)/i.test(data.mainGame);
  if (data.mainPlatform.trim().toLowerCase() === "roblox" && data.mainGame && robloxInputLooksResolvable) {
    const resolved = await resolveRobloxGame(data.mainGame);
    if (!resolved) return NextResponse.json({ error: "That Roblox Place ID or game URL could not be resolved. Check it and try again." }, { status: 400 });
    mainGame = resolved.name;
    robloxGame = { placeId: resolved.placeId, universeId: resolved.universeId, gameUrl: resolved.gameUrl, thumbnailUrl: resolved.thumbnailUrl };
  }

  const approvalRequired = data.requestType === "SERVER" ? await isServerProfileApprovalRequired() : true;
  const autoApproveServer = data.requestType === "SERVER" && !approvalRequired;
  const id = randomUUID();
  const createdProfileId = autoApproveServer ? randomUUID() : null;
  let timezone = "America/Detroit";
  if (autoApproveServer) {
    const preferences = await query<PreferenceRow[]>(`SELECT timezone FROM user_preferences WHERE user_id = ? LIMIT 1`, [session.userId]);
    timezone = preferences[0]?.timezone || timezone;
  }

  await withTransaction(async (connection) => {
    if (data.requestType === "SERVER") {
      await connection.execute(
        `UPDATE profile_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP(3)
         WHERE applicant_user_id = ? AND request_type = 'SERVER' AND discord_guild_id = ? AND status = 'CHANGES_REQUESTED'`, [session.userId, data.discordGuildId],
      );
    } else {
      await connection.execute(
        `UPDATE profile_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP(3)
         WHERE applicant_user_id = ? AND request_type = 'TEAM' AND requested_slug = ? AND status = 'CHANGES_REQUESTED'`, [session.userId, requestedSlug],
      );
    }

    if (autoApproveServer && createdProfileId && managedGuild) {
      await connection.execute(
        `INSERT INTO profile_requests
          (id, request_type, applicant_user_id, requested_name, requested_slug, discord_guild_id, description, logo_url, banner_url,
           main_platform, main_game, discord_invite_url, roblox_community_url, home_workspace_id, payload_json, status, created_profile_id, reviewed_at)
         VALUES (?, 'SERVER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'APPROVED', ?, CURRENT_TIMESTAMP(3))`,
        [id, session.userId, data.name, requestedSlug, data.discordGuildId, data.description || null, data.logoUrl || null,
         data.bannerUrl || null, data.mainPlatform || null, mainGame, data.discordInviteUrl || null, data.robloxCommunityUrl || null,
         JSON.stringify({ teamTag: null, region: null, robloxGame }), createdProfileId],
      );
      const iconUrl = data.logoUrl || (managedGuild.icon_hash ? `https://cdn.discordapp.com/icons/${managedGuild.guild_id}/${managedGuild.icon_hash}.png?size=512` : null);
      await connection.execute(
        `INSERT INTO workspaces
          (id, discord_guild_id, name, icon_url, banner_url, description, discord_invite_url, main_game_category,
           roblox_community_url, timezone, profile_status, verification_level, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'APPROVED', ?)`,
        [createdProfileId, managedGuild.guild_id, data.name, iconUrl, data.bannerUrl || null, data.description || null,
         data.discordInviteUrl || null, mainGame || data.mainPlatform || null, data.robloxCommunityUrl || null, timezone, session.userId],
      );
      await connection.execute(
        `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by) VALUES (?, ?, ?)`,
        [createdProfileId, session.discordId, session.userId],
      );
      await connection.execute(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status, approved_by) VALUES (?, ?, 'OWNER', 'ACTIVE', ?)`,
        [createdProfileId, session.userId, session.userId],
      );
    } else {
      await connection.execute(
        `INSERT INTO profile_requests
          (id, request_type, applicant_user_id, requested_name, requested_slug, discord_guild_id, description, logo_url, banner_url,
           main_platform, main_game, discord_invite_url, roblox_community_url, home_workspace_id, payload_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [id, data.requestType, session.userId, data.name, requestedSlug, data.discordGuildId || null, data.description || null,
         data.logoUrl || null, data.bannerUrl || null, data.mainPlatform || null, mainGame, data.discordInviteUrl || null,
         data.robloxCommunityUrl || null, data.homeWorkspaceId || null,
         JSON.stringify({ teamTag: data.teamTag || null, region: data.region || null, robloxGame })],
      );
    }

    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'PROFILE_REQUEST_SUBMITTED', 'PROFILES', ?, ?, ?)`,
      [randomUUID(), session.userId,
       autoApproveServer ? "Server profile created" : "Profile request submitted",
       autoApproveServer ? `${data.name} was created immediately after Discord ownership/Manage Server validation.` : `${data.name} is now waiting for platform staff review.`,
       autoApproveServer && createdProfileId ? `/dashboard/workspaces/${createdProfileId}` : "/dashboard/profile-requests"],
    );
  });

  if (autoApproveServer && createdProfileId) {
    await writeAuditLog({
      actorUserId: session.userId,
      workspaceId: createdProfileId,
      action: "profile_request.auto_approved",
      targetType: "workspace",
      targetId: createdProfileId,
      details: { requestId: id, discordGuildId: data.discordGuildId },
    });
  }

  return NextResponse.json({ id, createdProfileId, status: autoApproveServer ? "APPROVED" : "PENDING" }, { status: 201 });
}
