import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { validateDiscordBotWorkspaceTargets } from "@/lib/discord-bot-validation";
import { hasWorkspacePermission } from "@/lib/permissions";

const snowflake = z.string().trim().regex(/^\d{15,25}$/).or(z.literal(""));
const schema = z.object({
  announcementsEnabled: z.boolean(),
  temporaryMatchChannelsEnabled: z.boolean(),
  roleSyncEnabled: z.boolean(),
  announcementChannelId: snowflake,
  matchCategoryId: snowflake,
  competitorRoleId: snowflake,
  championRoleId: snowflake,
});

type WorkspaceRow = RowDataPacket & { discord_guild_id: string; bot_connected: number };

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE")) {
    return NextResponse.json({ error: "Manage Server Profile permission is required." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the Discord IDs before validating." }, { status: 400 });

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT discord_guild_id, bot_connected FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId],
  );
  const workspace = workspaces[0];
  if (!workspace) return NextResponse.json({ error: "Server profile was not found." }, { status: 404 });
  if (!workspace.bot_connected) return NextResponse.json({ error: "Install and check the Discord bot connection before validating feature targets." }, { status: 409 });

  const checks = await validateDiscordBotWorkspaceTargets({
    guildId: workspace.discord_guild_id,
    ...parsed.data,
  });
  const failed = checks.filter((check) => check.status === "FAIL").length;
  const warnings = checks.filter((check) => check.status === "WARN").length;

  return NextResponse.json({
    success: failed === 0,
    failed,
    warnings,
    checks,
  });
}
