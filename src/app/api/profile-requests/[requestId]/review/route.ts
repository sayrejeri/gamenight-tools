import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasPlatformPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "DENIED"]),
  reason: z.string().trim().max(1000).optional().default(""),
  verificationLevel: z.enum(["APPROVED", "OWNERSHIP_VERIFIED", "OFFICIAL", "PARTNER"]).optional().default("APPROVED"),
});

type RequestRow = RowDataPacket & {
  id: string; request_type: "SERVER" | "TEAM"; applicant_user_id: string; applicant_discord_id: string;
  requested_name: string; requested_slug: string | null; discord_guild_id: string | null; description: string | null;
  logo_url: string | null; banner_url: string | null; main_platform: string | null; main_game: string | null;
  discord_invite_url: string | null; roblox_community_url: string | null; home_workspace_id: string | null;
  payload_json: string | null; status: string; timezone: string | null; guild_icon_hash: string | null;
};

type TeamPayload = {
  teamTag?: string | null;
  region?: string | null;
  robloxGame?: { placeId?: string | null; universeId?: string | null; gameUrl?: string | null; thumbnailUrl?: string | null } | null;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await hasPlatformPermission(session.userId, "REVIEW_PROFILES"))) return NextResponse.json({ error: "Profile-review permission is required." }, { status: 403 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  const { requestId } = await context.params;

  const rows = await query<RequestRow[]>(
    `SELECT pr.*, u.discord_id AS applicant_discord_id, up.timezone, ug.icon_hash AS guild_icon_hash
     FROM profile_requests pr INNER JOIN users u ON u.id = pr.applicant_user_id
     LEFT JOIN user_preferences up ON up.user_id = u.id
     LEFT JOIN user_guilds ug ON ug.user_id = pr.applicant_user_id AND ug.guild_id = pr.discord_guild_id
     WHERE pr.id = ? LIMIT 1`, [requestId],
  );
  const profileRequest = rows[0];
  if (!profileRequest) return NextResponse.json({ error: "Profile request not found." }, { status: 404 });
  if (!["PENDING", "CHANGES_REQUESTED"].includes(profileRequest.status)) return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });

  let createdProfileId: string | null = null;
  await withTransaction(async (connection) => {
    if (parsed.data.decision === "APPROVED") {
      createdProfileId = randomUUID();
      if (profileRequest.request_type === "TEAM") {
        const payload = profileRequest.payload_json ? JSON.parse(profileRequest.payload_json) as TeamPayload : {};
        const game = payload.robloxGame ?? null;
        await connection.execute(
          `INSERT INTO teams
            (id, name, slug, tag, description, logo_url, banner_url, main_platform, main_game,
             main_game_external_id, main_game_universe_id, main_game_url, main_game_thumbnail_url,
             region, recruiting_status, profile_status, verification_level, home_workspace_id, owner_user_id, reviewed_by, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INVITE_ONLY', 'APPROVED', ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
          [createdProfileId, profileRequest.requested_name, profileRequest.requested_slug, payload.teamTag ?? null, profileRequest.description,
           profileRequest.logo_url, profileRequest.banner_url, profileRequest.main_platform, profileRequest.main_game,
           game?.placeId ?? null, game?.universeId ?? null, game?.gameUrl ?? null, game?.thumbnailUrl ?? null,
           payload.region ?? null, parsed.data.verificationLevel, profileRequest.home_workspace_id, profileRequest.applicant_user_id, session.userId],
        );
        await connection.execute(
          `INSERT INTO team_members (team_id, user_id, role, status, invited_by, joined_at)
           VALUES (?, ?, 'OWNER', 'ACTIVE', ?, CURRENT_TIMESTAMP(3))`, [createdProfileId, profileRequest.applicant_user_id, session.userId],
        );
      } else {
        if (!profileRequest.discord_guild_id) throw new Error("Approved server request is missing its Discord server ID.");
        const iconUrl = profileRequest.logo_url || (profileRequest.guild_icon_hash ? `https://cdn.discordapp.com/icons/${profileRequest.discord_guild_id}/${profileRequest.guild_icon_hash}.png?size=512` : null);
        await connection.execute(
          `INSERT INTO workspaces
            (id, discord_guild_id, name, icon_url, banner_url, description, discord_invite_url, main_game_category,
             roblox_community_url, timezone, profile_status, verification_level, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?)`,
          [createdProfileId, profileRequest.discord_guild_id, profileRequest.requested_name, iconUrl, profileRequest.banner_url,
           profileRequest.description, profileRequest.discord_invite_url, profileRequest.main_platform, profileRequest.roblox_community_url,
           profileRequest.timezone || "America/Detroit", parsed.data.verificationLevel, profileRequest.applicant_user_id],
        );
        await connection.execute(`INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by) VALUES (?, ?, ?)`, [createdProfileId, profileRequest.applicant_discord_id, session.userId]);
        await connection.execute(`INSERT INTO workspace_members (workspace_id, user_id, role, status, approved_by) VALUES (?, ?, 'OWNER', 'ACTIVE', ?)`, [createdProfileId, profileRequest.applicant_user_id, session.userId]);
      }
    }

    await connection.execute(
      `UPDATE profile_requests SET status = ?, reviewer_user_id = ?, review_reason = ?, reviewed_at = CURRENT_TIMESTAMP(3),
         created_profile_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [parsed.data.decision, session.userId, parsed.data.reason || null, createdProfileId, requestId],
    );
    const title = parsed.data.decision === "APPROVED" ? "Profile approved" : parsed.data.decision === "CHANGES_REQUESTED" ? "Profile changes requested" : "Profile request denied";
    const message = parsed.data.reason || `${profileRequest.requested_name} was marked ${parsed.data.decision.toLowerCase().replaceAll("_", " ")}.`;
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'PROFILE_REQUEST_REVIEWED', 'PROFILES', ?, ?, '/dashboard/profile-requests')`,
      [randomUUID(), profileRequest.applicant_user_id, title, message],
    );
  });

  await writeAuditLog({ actorUserId: session.userId, action: `profile_request.${parsed.data.decision.toLowerCase()}`,
    workspaceId: profileRequest.request_type === "SERVER" ? createdProfileId : null, targetType: profileRequest.request_type.toLowerCase(),
    targetId: createdProfileId ?? requestId, details: { requestId, reason: parsed.data.reason, verificationLevel: parsed.data.verificationLevel } });
  return NextResponse.json({ success: true, createdProfileId });
}
