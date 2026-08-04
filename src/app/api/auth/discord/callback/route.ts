import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { getPool, withTransaction } from "@/lib/db";
import { exchangeDiscordCode, fetchDiscordProfile } from "@/lib/discord";

export const dynamic = "force-dynamic";

type UserIdRow = RowDataPacket & { id: string };

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("discord_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/?authError=invalid_state", request.url));
  }

  try {
    const accessToken = await exchangeDiscordCode(code);
    const { user, guilds, connections } = await fetchDiscordProfile(accessToken);

    const userId = await withTransaction(async (connection) => {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO users (discord_id, username, global_name, avatar_hash, last_login_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           global_name = VALUES(global_name),
           avatar_hash = VALUES(avatar_hash),
           last_login_at = CURRENT_TIMESTAMP(3)`,
        [user.id, user.username, user.global_name ?? null, user.avatar ?? null],
      );

      const [userRows] = await connection.query<UserIdRow[]>(
        `SELECT id FROM users WHERE discord_id = ? LIMIT 1`,
        [user.id],
      );
      const currentUserId = userRows[0]?.id;
      if (!currentUserId) throw new Error("User record could not be loaded after login.");

      await connection.execute(`DELETE FROM user_guilds WHERE user_id = ?`, [currentUserId]);
      for (const guild of guilds) {
        await connection.execute(
          `INSERT INTO user_guilds
            (user_id, guild_id, guild_name, icon_hash, is_owner, permissions_value, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
          [
            currentUserId,
            guild.id,
            guild.name,
            guild.icon ?? null,
            guild.owner ? 1 : 0,
            guild.permissions ?? "0",
          ],
        );
      }

      for (const connectionItem of connections) {
        const [existing] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM user_connections
           WHERE user_id = ? AND source = 'DISCORD' AND connection_type = ? AND external_id = ?
           LIMIT 1`,
          [currentUserId, connectionItem.type, connectionItem.id],
        );

        if (existing[0]) {
          await connection.execute(
            `UPDATE user_connections
             SET handle = ?, is_verified = ?, updated_at = CURRENT_TIMESTAMP(3)
             WHERE id = ?`,
            [connectionItem.name, connectionItem.verified ? 1 : 0, existing[0].id],
          );
        } else {
          await connection.execute(
            `INSERT INTO user_connections
              (id, user_id, source, connection_type, external_id, handle, display_name, is_verified, is_visible)
             VALUES (?, ?, 'DISCORD', ?, ?, ?, ?, ?, 1)`,
            [
              randomUUID(),
              currentUserId,
              connectionItem.type,
              connectionItem.id,
              connectionItem.name,
              connectionItem.name,
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
        [currentUserId, user.id],
      );

      await connection.execute(
        `UPDATE event_cohosts
         SET invited_user_id = ?
         WHERE invited_discord_id = ? AND invited_user_id IS NULL`,
        [currentUserId, user.id],
      );

      return currentUserId;
    });

    const token = await createSessionToken({
      userId,
      discordId: user.id,
      username: user.username,
      globalName: user.global_name ?? null,
      avatarHash: user.avatar ?? null,
    });

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    const options = sessionCookieOptions();
    response.cookies.set(options.name, token, options);
    response.cookies.delete("discord_oauth_state");
    return response;
  } catch (error) {
    console.error("Discord OAuth callback failed", error);
    return NextResponse.redirect(new URL("/?authError=discord_login_failed", request.url));
  }
}
