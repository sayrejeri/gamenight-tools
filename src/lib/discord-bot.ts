import { createPublicKey, verify } from "node:crypto";

const DISCORD_API_BASE = "https://discord.com/api/v10";

// View Channels + Send Messages + Embed Links + Read Message History + Manage Channels + Manage Roles.
// Manage Channels/Roles support the optional v1.0 temporary-match-channel and role-sync features.
const BOT_PERMISSION_BITS = "268520464";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

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

export function verifyDiscordInteractionSignature(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKeyHex || !signature || !timestamp || !/^[a-f0-9]{64}$/i.test(publicKeyHex) || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + rawBody), publicKey, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function registerDiscordGuildCommands(guildId: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!token || !clientId) throw new Error("Discord bot credentials are not configured.");

  const commands = [
    {
      name: "gnt",
      description: "Game Night Tools server commands",
      type: 1,
      options: [
        { type: 1, name: "status", description: "Show this server's Game Night Tools connection status" },
        { type: 1, name: "events", description: "Show upcoming Game Night Tools events for this server" },
      ],
    },
  ];

  const response = await fetch(`${DISCORD_API_BASE}/applications/${encodeURIComponent(clientId)}/guilds/${encodeURIComponent(guildId)}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord command registration failed with status ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}.`);
  }
}
