"use client";

import { useEffect, useMemo, useState } from "react";
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
  youtube: "youtube",
};

export function platformIconUrl(type: string): string | null {
  const normalized = normalizeConnectionType(type);
  if (normalized === "xbox") return "/platform-icons/xbox.svg";
  const slug = SIMPLE_ICON_SLUGS[normalized];
  return slug ? `https://cdn.simpleicons.org/${slug}/ffffff` : null;
}

export function PlatformIcon({ type, avatarUrl, size = "medium" }: { type: string; avatarUrl?: string | null; size?: "small" | "medium" | "large" }) {
  const label = formatConnectionType(type);
  const source = useMemo(() => platformIconUrl(type) ?? avatarUrl ?? null, [type, avatarUrl]);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [source]);

  const showImage = Boolean(source && !failed);

  return (
    <span className={`platform-icon platform-icon-${size}`} aria-hidden="true">
      {showImage ? <img src={source!} alt="" onError={() => setFailed(true)} /> : <strong>{label.slice(0, 2).toUpperCase()}</strong>}
    </span>
  );
}
