export type RobloxUserIdentity = {
  id: string;
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string | null;
};

export type RobloxGameIdentity = {
  placeId: string;
  universeId: string | null;
  name: string;
  description: string | null;
  creatorName: string | null;
  gameUrl: string;
  thumbnailUrl: string | null;
};

type RobloxUsernameResponse = {
  data?: Array<{ id: number; name: string; displayName: string; requestedUsername?: string }>;
};

type RobloxThumbnailResponse = {
  data?: Array<{ targetId?: number; state?: string; imageUrl?: string }>;
};

type RobloxUniverseResponse = { universeId?: number };
type RobloxGameDetailsResponse = {
  data?: Array<{
    id: number;
    rootPlaceId: number;
    name: string;
    description?: string;
    creator?: { name?: string };
  }>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": "GameNightTools/0.2",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export function extractRobloxPlaceId(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4,20}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/(?:roblox\.com\/games\/|placeId=)(\d{4,20})/i);
  return match?.[1] ?? null;
}

export async function resolveRobloxUser(username: string): Promise<RobloxUserIdentity | null> {
  const result = await fetchJson<RobloxUsernameResponse>("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: false }),
  });
  const user = result?.data?.[0];
  if (!user) return null;

  const id = String(user.id);
  const thumbnail = await fetchJson<RobloxThumbnailResponse>(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(id)}&size=150x150&format=Png&isCircular=false`,
  );

  return {
    id,
    username: user.name,
    displayName: user.displayName,
    profileUrl: `https://www.roblox.com/users/${id}/profile`,
    avatarUrl: thumbnail?.data?.[0]?.imageUrl ?? null,
  };
}

export async function resolveRobloxGame(value: string): Promise<RobloxGameIdentity | null> {
  const placeId = extractRobloxPlaceId(value);
  if (!placeId) return null;

  let universeId: string | null = null;
  const universe = await fetchJson<RobloxUniverseResponse>(
    `https://apis.roblox.com/universes/v1/places/${encodeURIComponent(placeId)}/universe`,
  );
  if (universe?.universeId) universeId = String(universe.universeId);

  if (!universeId) {
    const placeDetails = await fetchJson<Array<{ universeId?: number; name?: string }>>(
      `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${encodeURIComponent(placeId)}`,
    );
    if (placeDetails?.[0]?.universeId) universeId = String(placeDetails[0].universeId);
  }

  let name = `Roblox Experience ${placeId}`;
  let description: string | null = null;
  let creatorName: string | null = null;

  if (universeId) {
    const details = await fetchJson<RobloxGameDetailsResponse>(
      `https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`,
    );
    const game = details?.data?.[0];
    if (game) {
      name = game.name;
      description = game.description ?? null;
      creatorName = game.creator?.name ?? null;
    }
  }

  let thumbnailUrl: string | null = null;
  if (universeId) {
    const thumbnails = await fetchJson<RobloxThumbnailResponse>(
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${encodeURIComponent(universeId)}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`,
    );
    thumbnailUrl = thumbnails?.data?.[0]?.imageUrl ?? null;

    if (!thumbnailUrl) {
      const icon = await fetchJson<RobloxThumbnailResponse>(
        `https://thumbnails.roblox.com/v1/games/icons?universeIds=${encodeURIComponent(universeId)}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`,
      );
      thumbnailUrl = icon?.data?.[0]?.imageUrl ?? null;
    }
  }

  return {
    placeId,
    universeId,
    name,
    description,
    creatorName,
    gameUrl: `https://www.roblox.com/games/${placeId}`,
    thumbnailUrl,
  };
}
