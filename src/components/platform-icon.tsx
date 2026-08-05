import { formatConnectionType, normalizeConnectionType } from "@/lib/connections";

const SIMPLE_ICON_SLUGS: Record<string, string> = {
  battlenet: "battledotnet",
  epicgames: "epicgames",
  facebook: "facebook",
  github: "github",
  instagram: "instagram",
  leagueoflegends: "leagueoflegends",
  minecraft: "minecraft",
  playstation: "playstation",
  playstationnetwork: "playstation",
  reddit: "reddit",
  roblox: "roblox",
  spotify: "spotify",
  steam: "steam",
  tiktok: "tiktok",
  twitch: "twitch",
  twitter: "x",
  x: "x",
  xbox: "xbox",
  youtube: "youtube",
};

export function platformIconUrl(type: string): string | null {
  const slug = SIMPLE_ICON_SLUGS[normalizeConnectionType(type)];
  return slug ? `https://cdn.simpleicons.org/${slug}/ffffff` : null;
}

export function PlatformIcon({ type, avatarUrl, size = "medium" }: { type: string; avatarUrl?: string | null; size?: "small" | "medium" | "large" }) {
  const iconUrl = avatarUrl || platformIconUrl(type);
  const label = formatConnectionType(type);
  return (
    <span className={`platform-icon platform-icon-${size}`} aria-hidden="true">
      {iconUrl ? <img src={iconUrl} alt="" /> : <strong>{label.slice(0, 2).toUpperCase()}</strong>}
    </span>
  );
}
