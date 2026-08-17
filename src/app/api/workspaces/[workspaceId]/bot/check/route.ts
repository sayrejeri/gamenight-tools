import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { query, withTransaction } from "@/lib/db";
import { fetchDiscordBotGuild, isDiscordBotConfigured, registerDiscordGuildCommands } from "@/lib/discord-bot";
import { hasWorkspacePermission } from "@/lib/permissions";

type WorkspaceRow = RowDataPacket & {
  id: string;
  name: string;
  discord_guild_id: string;
  bot_connected: number;
};

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { workspaceId } = await context.params;
  if (!await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE")) {
    return NextResponse.json({ error: "Manage Server Profile permission is required." }, { status: 403 });
  }
  if (!isDiscordBotConfigured()) {
    return NextResponse.json({ error: "The Discord bot beta is not configured on this Game Night Tools deployment." }, { status: 503 });
  }

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT id, name, discord_guild_id, bot_connected FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId],
  );
  const workspace = workspaces[0];
  if (!workspace) return NextResponse.json({ error: "Server profile was not found." }, { status: 404 });

  try {
    const guild = await fetchDiscordBotGuild(workspace.discord_guild_id);
    const connected = Boolean(guild);
    if (Boolean(workspace.bot_connected) !== connected) {
      await withTransaction(async (connection) => {
        await connection.execute(
          `UPDATE workspaces SET bot_connected = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [connected ? 1 : 0, workspaceId],
        );
        await writeAuditLog({
          actorUserId: session.userId,
          action: connected ? "workspace.bot.connected" : "workspace.bot.disconnected",
          workspaceId,
          targetType: "WORKSPACE",
          targetId: workspaceId,
          details: { discordGuildId: workspace.discord_guild_id, discordGuildName: guild?.name ?? null },
        }, connection);
      });
    }

    let commandsRegistered = false;
    let commandWarning: string | null = null;
    if (connected) {
      try {
        await registerDiscordGuildCommands(workspace.discord_guild_id);
        commandsRegistered = true;
      } catch (error) {
        console.error("Discord guild command registration failed", error);
        commandWarning = "The bot is connected, but its beta slash commands could not be registered yet.";
      }
    }

    return NextResponse.json({
      connected,
      commandsRegistered,
      guildName: guild?.name ?? null,
      message: connected
        ? `${`Discord bot connected to ${guild?.name ?? workspace.name}.`}${commandsRegistered ? " /gnt commands are registered." : commandWarning ? ` ${commandWarning}` : ""}`
        : "The bot is not currently installed in this Discord server.",
    });
  } catch (error) {
    console.error("Discord bot connection check failed", error);
    return NextResponse.json({ error: "Discord could not be reached to verify the bot installation. Try again in a moment." }, { status: 502 });
  }
}
