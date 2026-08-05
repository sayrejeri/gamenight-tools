import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { isValidSiteUsername, normalizeSiteUsername } from "@/lib/profile";

const settingsSchema = z.object({
  siteUsername: z.string().min(3).max(40),
  bio: z.string().max(500).optional().default(""),
  bannerUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  mainPlatform: z.string().max(80).optional().default(""),
  timezone: z.string().max(100).optional().default(""),
  timeFormat: z.enum(["AUTO", "12H", "24H"]).default("AUTO"),
  profileVisibility: z.enum(["PUBLIC", "MEMBERS", "PRIVATE"]).default("PUBLIC"),
  showGameIdentities: z.boolean().default(true),
  showEventHistory: z.boolean().default(true),
  showTeams: z.boolean().default(true),
  showServers: z.boolean().default(true),
  discoverable: z.boolean().default(true),
  allowProfileMessages: z.boolean().default(true),
  onboardingCompleted: z.boolean().optional().default(true),
});

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the profile fields and try again." }, { status: 400 });

  const siteUsername = normalizeSiteUsername(parsed.data.siteUsername);
  if (!isValidSiteUsername(siteUsername)) {
    return NextResponse.json({ error: "Site usernames must be 3–40 characters and use letters, numbers, underscores, or hyphens." }, { status: 400 });
  }

  const existing = await query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM users WHERE site_username = ? AND id <> ? LIMIT 1`,
    [siteUsername, session.userId],
  );
  if (existing[0]) return NextResponse.json({ error: "That site username is already taken." }, { status: 409 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE users SET site_username = ?, bio = ?, banner_url = ?, main_platform = ?,
         profile_visibility = ?, onboarding_completed = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        siteUsername,
        parsed.data.bio.trim() || null,
        parsed.data.bannerUrl.trim() || null,
        parsed.data.mainPlatform.trim() || null,
        parsed.data.profileVisibility,
        parsed.data.onboardingCompleted ? 1 : 0,
        session.userId,
      ],
    );
    await connection.execute(
      `INSERT INTO user_preferences
        (user_id, timezone, time_format, show_game_identities, show_event_history,
         show_teams, show_servers, discoverable, allow_profile_messages)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         timezone = VALUES(timezone), time_format = VALUES(time_format),
         show_game_identities = VALUES(show_game_identities),
         show_event_history = VALUES(show_event_history), show_teams = VALUES(show_teams),
         show_servers = VALUES(show_servers), discoverable = VALUES(discoverable),
         allow_profile_messages = VALUES(allow_profile_messages)`,
      [
        session.userId,
        parsed.data.timezone.trim() || null,
        parsed.data.timeFormat,
        parsed.data.showGameIdentities ? 1 : 0,
        parsed.data.showEventHistory ? 1 : 0,
        parsed.data.showTeams ? 1 : 0,
        parsed.data.showServers ? 1 : 0,
        parsed.data.discoverable ? 1 : 0,
        parsed.data.allowProfileMessages ? 1 : 0,
      ],
    );
  });

  return NextResponse.json({ success: true, siteUsername });
}
