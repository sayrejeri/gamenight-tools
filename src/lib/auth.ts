import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

const SESSION_COOKIE = "gamenight_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    avatarHash: user.avatarHash,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function readSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.discordId !== "string" || typeof payload.username !== "string") {
      return null;
    }

    const users = await query<(RowDataPacket & { account_status: string })[]>(
      `SELECT account_status FROM users WHERE id = ? LIMIT 1`,
      [payload.sub],
    );
    if (users[0]?.account_status !== "ACTIVE") return null;

    return {
      userId: payload.sub,
      discordId: payload.discordId,
      username: payload.username,
      globalName: typeof payload.globalName === "string" ? payload.globalName : null,
      avatarHash: typeof payload.avatarHash === "string" ? payload.avatarHash : null,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await readSession();
  if (!session) redirect("/");
  return session;
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function getDiscordAvatarUrl(discordId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=128`;
}

export function isPlatformOwner(discordId: string): boolean {
  const configured = process.env.PLATFORM_OWNER_DISCORD_IDS ?? "";
  return configured
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(discordId);
}
