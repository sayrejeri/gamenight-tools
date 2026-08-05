import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getWorkspaceRole } from "@/lib/access";
import { withTransaction } from "@/lib/db";

const nullableUrl = z.string().trim().url().max(1000).nullable().optional().or(z.literal(""));

const gameSchema = z.object({
  platformName: z.string().trim().min(1).max(80),
  gameName: z.string().trim().min(1).max(191),
  gameUrl: nullableUrl,
  externalId: z.string().trim().max(80).nullable().optional(),
  universeId: z.string().trim().max(80).nullable().optional(),
  thumbnailUrl: nullableUrl,
  primary: z.boolean().default(false),
});

const profileSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().trim().min(2).max(100),
  discordInviteUrl: nullableUrl,
  mainGameCategory: z.string().trim().max(80).nullable().optional(),
  robloxCommunityName: z.string().trim().max(191).nullable().optional(),
  robloxCommunityUrl: nullableUrl,
  games: z.array(gameSchema).max(20).default([]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const role = await getWorkspaceRole(session.userId, workspaceId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only server owners and admins can edit the server profile." }, { status: 403 });
  }

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid server profile information.", details: parsed.error.flatten() }, { status: 400 });
  }

  const games = parsed.data.games.map((game, index) => ({
    ...game,
    primary: game.primary || (index === 0 && !parsed.data.games.some((item) => item.primary)),
  }));

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE workspaces
       SET description = ?, timezone = ?, discord_invite_url = ?, main_game_category = ?,
           roblox_community_name = ?, roblox_community_url = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        parsed.data.description || null,
        parsed.data.timezone,
        parsed.data.discordInviteUrl || null,
        parsed.data.mainGameCategory || null,
        parsed.data.robloxCommunityName || null,
        parsed.data.robloxCommunityUrl || null,
        workspaceId,
      ],
    );

    await connection.execute(`DELETE FROM workspace_games WHERE workspace_id = ?`, [workspaceId]);
    for (const [index, game] of games.entries()) {
      await connection.execute(
        `INSERT INTO workspace_games
          (id, workspace_id, platform_name, game_name, game_url, external_id,
           universe_id, thumbnail_url, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          workspaceId,
          game.platformName,
          game.gameName,
          game.gameUrl || null,
          game.externalId ?? null,
          game.universeId ?? null,
          game.thumbnailUrl || null,
          game.primary ? 1 : 0,
          index,
        ],
      );
    }
  });

  return NextResponse.json({ success: true });
}
