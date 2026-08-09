import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const nullableUrl = z.string().trim().url().max(1000).nullable().optional().or(z.literal(""));
const gameSchema = z.object({
  platformName: z.string().trim().min(1).max(80), gameName: z.string().trim().min(1).max(191), gameUrl: nullableUrl,
  externalId: z.string().trim().max(80).nullable().optional(), universeId: z.string().trim().max(80).nullable().optional(),
  thumbnailUrl: nullableUrl, primary: z.boolean().default(false),
});
const profileSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(), timezone: z.string().trim().min(2).max(100),
  iconUrl: nullableUrl, bannerUrl: nullableUrl, discordInviteUrl: nullableUrl,
  mainGameCategory: z.string().trim().max(80).nullable().optional(), robloxCommunityName: z.string().trim().max(191).nullable().optional(),
  robloxCommunityUrl: nullableUrl, chatEnabled: z.boolean().default(false), suggestionsEnabled: z.boolean().default(true),
  games: z.array(gameSchema).max(20).default([]),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE"))) return NextResponse.json({ error: "Server-profile management permission is required." }, { status: 403 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid server profile information.", details: parsed.error.flatten() }, { status: 400 });

  const games = parsed.data.games.map((game, index) => ({ ...game, primary: game.primary || (index === 0 && !parsed.data.games.some((item) => item.primary)) }));
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE workspaces SET description = ?, timezone = ?, icon_url = ?, banner_url = ?, discord_invite_url = ?,
           main_game_category = ?, roblox_community_name = ?, roblox_community_url = ?, chat_enabled = ?, suggestions_enabled = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [parsed.data.description || null, parsed.data.timezone, parsed.data.iconUrl || null, parsed.data.bannerUrl || null,
       parsed.data.discordInviteUrl || null, parsed.data.mainGameCategory || null, parsed.data.robloxCommunityName || null,
       parsed.data.robloxCommunityUrl || null, parsed.data.chatEnabled ? 1 : 0, parsed.data.suggestionsEnabled ? 1 : 0, workspaceId],
    );
    await connection.execute(`DELETE FROM workspace_games WHERE workspace_id = ?`, [workspaceId]);
    for (const [index, game] of games.entries()) {
      await connection.execute(
        `INSERT INTO workspace_games (id, workspace_id, platform_name, game_name, game_url, external_id, universe_id, thumbnail_url, is_primary, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), workspaceId, game.platformName, game.gameName, game.gameUrl || null, game.externalId ?? null,
         game.universeId ?? null, game.thumbnailUrl || null, game.primary ? 1 : 0, index],
      );
    }
  });
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "workspace.profile.updated", targetType: "workspace", targetId: workspaceId, details: { gameCount: games.length, mainGameCategory: parsed.data.mainGameCategory ?? null } });
  return NextResponse.json({ success: true });
}
