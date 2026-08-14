const DISCORD_API_BASE = "https://discord.com/api/v10";

// View Channels + Send Messages + Embed Links + Read Message History + Manage Channels + Manage Roles.
// Manage Channels/Roles support the optional v1.0 temporary-match-channel and role-sync features.
const BOT_PERMISSION_BITS = "268520464";

export type DiscordBotGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner_id?: string;
  permissions?: string;
};

export function isDiscordBotConfigured(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID?.trim() && process.env.DISCORD_BOT_TOKEN?.trim());
}

export function buildDiscordBotInstallUrl(guildId: string): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId || !/^\d{15,25}$/.test(guildId)) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: BOT_PERMISSION_BITS,
    guild_id: guildId,
    disable_guild_select: "true",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function fetchDiscordBotGuild(guildId: string): Promise<DiscordBotGuild | null> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  const response = await fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord bot guild lookup failed with status ${response.status}.`);
  return await response.json() as DiscordBotGuild;
}
