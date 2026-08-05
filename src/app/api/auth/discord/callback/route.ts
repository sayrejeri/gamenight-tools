import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { exchangeDiscordCode, fetchDiscordProfile } from "@/lib/discord";
import { buildConnectionProfileUrl } from "@/lib/connections";
import { reserveUniqueSiteUsername } from "@/lib/profile";
import { resolveRobloxUser } from "@/lib/roblox";

export const dynamic = "force-dynamic";

type UserIdRow = RowDataPacket & { id: string; site_username: string | null };
type LoginStage = "discord_token" | "discord_profile" | "database" | "session";

type EnrichedConnection = {
  type: string;
  originalExternalId: string;
  externalId: string;
  handle: string;
  displayName: string;
  verified: boolean;
  profileUrl: string | null;
  avatarUrl: string | null;
};

function appUrl(path: string, request: NextRequest): URL {
  const baseUrl = process.env.APP_URL ?? request.nextUrl.origin;
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

async function enrichDiscordConnection(connectionItem: {
  type: string;
  id: string;
  name: string;
  verified?: boolean;
}): Promise<EnrichedConnection> {
  const type = connectionItem.type.toLowerCase();
  if (type === "roblox") {
    const identity = await resolveRobloxUser(connectionItem.name);
    if (identity) {
      return {
        type,
        originalExternalId: connectionItem.id,
        externalId: identity.id,
        handle: identity.username,
        displayName: identity.displayName,
        verified: Boolean(connectionItem.verified),
        profileUrl: identity.profileUrl,
        avatarUrl: identity.avatarUrl,
      };
    }
  }

  return {
    type,
    originalExternalId: connectionItem.id,
    externalId: connectionItem.id,
    handle: connectionItem.name,
    displayName: connectionItem.name,
    verified: Boolean(connectionItem.verified),
    profileUrl: buildConnectionProfileUrl(type, connectionItem.id, connectionItem.name),
    avatarUrl: null,
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("discord_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(appUrl("/?authError=invalid_state", request));
  }

  let stage: LoginStage = "discord_token";

  try {
    const accessToken = await exchangeDiscordCode(code);

    stage = "discord_profile";
    const { user, guilds, connections } = await fetchDiscordProfile(accessToken);
    const enrichedConnections = await Promise.all(connections.map(enrichDiscordConnection));

    stage = "database";
    const { userId, needsOnboarding } = await withTransaction(async (connection) => {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO users (discord_id, username, global_name, avatar_hash, last_login_at, last_seen_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           global_name = VALUES(global_name),
           avatar_hash = VALUES(avatar_hash),
           last_login_at = CURRENT_TIMESTAMP(3),
           last_seen_at = CURRENT_TIMESTAMP(3)`,
        [user.id, user.username, user.global_name ?? null, user.avatar ?? null],
      );

      const [userRows] = await connection.query<UserIdRow[]>(
        `SELECT id, site_username FROM users WHERE discord_id = ? LIMIT 1`,
        [user.id],
      );
      const currentUser = userRows[0];
      if (!currentUser) throw new Error("User record could not be loaded after login.");

      let siteUsername = currentUser.site_username;
      if (!siteUsername) {
        siteUsername = await reserveUniqueSiteUsername(connection, user.username, user.id);
        await connection.execute(`UPDATE users SET site_username = ? WHERE id = ?`, [siteUsername, currentUser.id]);
      }

      await connection.execute(
        `INSERT INTO user_preferences (user_id, timezone)
         VALUES (?, NULL)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [currentUser.id],
      );

      await connection.execute(`DELETE FROM user_guilds WHERE user_id = ?`, [currentUser.id]);
      for (const guild of guilds) {
        await connection.execute(
          `INSERT INTO user_guilds
            (user_id, guild_id, guild_name, icon_hash, is_owner, permissions_value, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
          [
            currentUser.id,
            guild.id,
            guild.name,
            guild.icon ?? null,
            guild.owner ? 1 : 0,
            guild.permissions ?? "0",
          ],
        );
      }

      for (const connectionItem of enrichedConnections) {
        const [existing] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM user_connections
           WHERE user_id = ? AND source = 'DISCORD' AND connection_type = ?
             AND (external_id IN (?, ?) OR LOWER(handle) = LOWER(?))
           LIMIT 1`,
          [
            currentUser.id,
            connectionItem.type,
            connectionItem.externalId,
            connectionItem.originalExternalId,
            connectionItem.handle,
          ],
        );

        if (existing[0]) {
          await connection.execute(
            `UPDATE user_connections
             SET external_id = ?, handle = ?, display_name = ?, profile_url = ?, avatar_url = ?,
                 is_verified = ?, updated_at = CURRENT_TIMESTAMP(3)
             WHERE id = ?`,
            [
              connectionItem.externalId,
              connectionItem.handle,
              connectionItem.displayName,
              connectionItem.profileUrl,
              connectionItem.avatarUrl,
              connectionItem.verified ? 1 : 0,
              existing[0].id,
            ],
          );
        } else {
          await connection.execute(
            `INSERT INTO user_connections
              (id, user_id, source, connection_type, external_id, handle, display_name,
               profile_url, avatar_url, is_verified, is_visible)
             VALUES (?, ?, 'DISCORD', ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              randomUUID(),
              currentUser.id,
              connectionItem.type,
              connectionItem.externalId,
              connectionItem.handle,
              connectionItem.displayName,
              connectionItem.profileUrl,
              connectionItem.avatarUrl,
              connectionItem.verified ? 1 : 0,
            ],
          );
        }
      }

      await connection.execute(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status, approved_by)
         SELECT claim.workspace_id, ?, 'OWNER', 'ACTIVE', NULL
         FROM workspace_owner_claims claim
         WHERE claim.discord_id = ?
         ON DUPLICATE KEY UPDATE role = 'OWNER', status = 'ACTIVE'`,
        [currentUser.id, user.id],
      );

      await connection.execute(
        `UPDATE event_cohosts
         SET invited_user_id = ?
         WHERE invited_discord_id = ? AND invited_user_id IS NULL`,
        [currentUser.id, user.id],
      );

      const [onboardingRows] = await connection.query<(RowDataPacket & { onboarding_completed: number })[]>(
        `SELECT onboarding_completed FROM users WHERE id = ? LIMIT 1`,
        [currentUser.id],
      );

      return {
        userId: currentUser.id,
        needsOnboarding: !Boolean(onboardingRows[0]?.onboarding_completed),
      };
    });

    stage = "session";
    const token = await createSessionToken({
      userId,
      discordId: user.id,
      username: user.username,
      globalName: user.global_name ?? null,
      avatarHash: user.avatar ?? null,
    });

    const response = NextResponse.redirect(appUrl(needsOnboarding ? "/dashboard/onboarding" : "/dashboard", request));
    const options = sessionCookieOptions();
    response.cookies.set(options.name, token, options);
    response.cookies.delete("discord_oauth_state");
    return response;
  } catch (error) {
    console.error(`Discord OAuth callback failed during ${stage}`, error);
    return NextResponse.redirect(
      appUrl(`/?authError=discord_login_failed&stage=${encodeURIComponent(stage)}`, request),
    );
  }
}
