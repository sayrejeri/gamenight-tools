import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

export function slugifyProfileName(value: string, fallback = "player"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

export function normalizeSiteUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

export function isValidSiteUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{2,39}$/.test(value);
}

export async function reserveUniqueSiteUsername(
  connection: PoolConnection,
  preferred: string,
  discordId: string,
): Promise<string> {
  const base = normalizeSiteUsername(preferred) || `player-${discordId.slice(-6)}`;
  const safeBase = base.length >= 3 ? base : `${base}${discordId.slice(-4)}`;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const candidate = `${safeBase.slice(0, 40 - suffix.length)}${suffix}`;
    const [rows] = await connection.query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM users WHERE site_username = ? LIMIT 1`,
      [candidate],
    );
    if (!rows[0]) return candidate;
  }

  return `player-${discordId.slice(-12)}`.slice(0, 40);
}

export function displayUserName(user: { site_username?: string | null; global_name?: string | null; username: string }): string {
  return user.site_username ?? user.global_name ?? user.username;
}
