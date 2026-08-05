import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { slugifyProfileName } from "@/lib/profile";

const requestSchema = z.object({
  requestType: z.enum(["SERVER", "TEAM"]),
  name: z.string().trim().min(3).max(120),
  slug: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  logoUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  bannerUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  mainPlatform: z.string().trim().max(80).optional().default(""),
  mainGame: z.string().trim().max(191).optional().default(""),
  discordGuildId: z.string().trim().max(32).optional().default(""),
  discordInviteUrl: z.string().url().max(500).or(z.literal("")).optional().default(""),
  robloxCommunityUrl: z.string().url().max(500).or(z.literal("")).optional().default(""),
  homeWorkspaceId: z.string().uuid().or(z.literal("")).optional().default(""),
  teamTag: z.string().trim().max(16).optional().default(""),
  region: z.string().trim().max(80).optional().default(""),
});

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the profile request fields." }, { status: 400 });
  const data = parsed.data;

  if (data.requestType === "SERVER") {
    if (!data.discordGuildId) return NextResponse.json({ error: "Select a Discord server you own or manage." }, { status: 400 });
    const guilds = await query<(RowDataPacket & { guild_id: string; guild_name: string; icon_hash: string | null; is_owner: number; permissions_value: string })[]>(
      `SELECT guild_id, guild_name, icon_hash, is_owner, permissions_value FROM user_guilds
       WHERE user_id = ? AND guild_id = ? LIMIT 1`,
      [session.userId, data.discordGuildId],
    );
    if (!guilds[0]) return NextResponse.json({ error: "That Discord server was not found in your authorized server list." }, { status: 403 });
    const duplicate = await query<RowDataPacket[]>(`SELECT id FROM workspaces WHERE discord_guild_id = ? LIMIT 1`, [data.discordGuildId]);
    if (duplicate[0]) return NextResponse.json({ error: "That Discord server already has a profile." }, { status: 409 });
  }

  const requestedSlug = slugifyProfileName(data.slug || data.name);
  if (data.requestType === "TEAM") {
    const duplicates = await query<RowDataPacket[]>(
      `SELECT id FROM teams WHERE slug = ?
       UNION ALL SELECT id FROM profile_requests WHERE request_type = 'TEAM' AND requested_slug = ? AND status IN ('PENDING', 'CHANGES_REQUESTED', 'APPROVED') LIMIT 1`,
      [requestedSlug, requestedSlug],
    );
    if (duplicates[0]) return NextResponse.json({ error: "That team URL is already in use or under review." }, { status: 409 });
  }

  const id = randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO profile_requests
        (id, request_type, applicant_user_id, requested_name, requested_slug, discord_guild_id,
         description, logo_url, banner_url, main_platform, main_game, discord_invite_url,
         roblox_community_url, home_workspace_id, payload_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id, data.requestType, session.userId, data.name, requestedSlug,
        data.discordGuildId || null, data.description || null, data.logoUrl || null,
        data.bannerUrl || null, data.mainPlatform || null, data.mainGame || null,
        data.discordInviteUrl || null, data.robloxCommunityUrl || null,
        data.homeWorkspaceId || null,
        JSON.stringify({ teamTag: data.teamTag || null, region: data.region || null }),
      ],
    );
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'PROFILE_REQUEST_SUBMITTED', 'PROFILES', 'Profile request submitted', ?, '/dashboard/profile-requests')`,
      [randomUUID(), session.userId, `${data.name} is now waiting for platform staff review.`],
    );
  });

  return NextResponse.json({ id }, { status: 201 });
}
