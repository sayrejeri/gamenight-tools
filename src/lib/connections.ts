const CONNECTION_LABELS: Record<string, string> = {
  battlenet: "Battle.net",
  "battle.net": "Battle.net",
  epicgames: "Epic Games",
  facebook: "Facebook",
  github: "GitHub",
  instagram: "Instagram",
  leagueoflegends: "League of Legends",
  minecraft: "Minecraft",
  playstation: "PlayStation",
  playstationnetwork: "PlayStation",
  reddit: "Reddit",
  roblox: "Roblox",
  spotify: "Spotify",
  steam: "Steam",
  tiktok: "TikTok",
  twitch: "Twitch",
  twitter: "X",
  x: "X",
  xbox: "Xbox",
  youtube: "YouTube",
};

export function normalizeConnectionType(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "").replaceAll("-", "");
}

export function formatConnectionType(value: string): string {
  const normalized = normalizeConnectionType(value);
  if (CONNECTION_LABELS[normalized]) return CONNECTION_LABELS[normalized];
  return value
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildConnectionProfileUrl(
  connectionType: string,
  externalId: string | null,
  handle: string,
  storedProfileUrl?: string | null,
): string | null {
  if (storedProfileUrl) return storedProfileUrl;
  const type = normalizeConnectionType(connectionType);
  const safeHandle = encodeURIComponent(handle.replace(/^@/, ""));

  if (type === "roblox" && externalId) return `https://www.roblox.com/users/${encodeURIComponent(externalId)}/profile`;
  if (type === "github") return `https://github.com/${safeHandle}`;
  if (type === "twitch") return `https://www.twitch.tv/${safeHandle}`;
  if (type === "youtube") return handle.startsWith("@")
    ? `https://www.youtube.com/${encodeURIComponent(handle)}`
    : `https://www.youtube.com/@${safeHandle}`;
  if (type === "steam" && externalId) return `https://steamcommunity.com/profiles/${encodeURIComponent(externalId)}`;
  if (type === "x" || type === "twitter") return `https://x.com/${safeHandle}`;
  if (type === "instagram") return `https://www.instagram.com/${safeHandle}`;
  if (type === "tiktok") return `https://www.tiktok.com/@${safeHandle}`;
  if (type === "reddit") return `https://www.reddit.com/user/${safeHandle}`;
  if (type === "xbox") return `https://account.xbox.com/en-us/profile?gamertag=${safeHandle}`;

  return null;
}
