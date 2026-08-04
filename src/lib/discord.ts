import type { DiscordConnection, DiscordGuild, DiscordUser } from "@/lib/types";

const DISCORD_API = "https://discord.com/api/v10";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getDiscordRedirectUri(): string {
  return process.env.DISCORD_REDIRECT_URI ?? `${requiredEnv("APP_URL")}/api/auth/discord/callback`;
}

export function createDiscordAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv("DISCORD_CLIENT_ID"),
    redirect_uri: getDiscordRedirectUri(),
    response_type: "code",
    scope: "identify guilds connections",
    state,
    prompt: "consent",
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDiscordCode(code: string): Promise<string> {
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("DISCORD_CLIENT_ID"),
      client_secret: requiredEnv("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: getDiscordRedirectUri(),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Discord did not return an access token.");
  return payload.access_token;
}

async function discordGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Discord request ${path} failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function fetchDiscordProfile(accessToken: string) {
  const [user, guilds, connections] = await Promise.all([
    discordGet<DiscordUser>("/users/@me", accessToken),
    discordGet<DiscordGuild[]>("/users/@me/guilds", accessToken),
    discordGet<DiscordConnection[]>("/users/@me/connections", accessToken),
  ]);

  return { user, guilds, connections };
}
