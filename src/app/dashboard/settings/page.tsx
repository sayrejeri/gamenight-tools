import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { DiscordBotPreferencesForm } from "@/components/discord-bot-preferences-form";
import { ProfileSettingsForm } from "@/components/profile-settings-form";

type ProfileRow = RowDataPacket & {
  site_username: string | null;
  bio: string | null;
  banner_url: string | null;
  main_platform: string | null;
  profile_visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  timezone: string | null;
  time_format: "AUTO" | "12H" | "24H";
  show_game_identities: number;
  show_event_history: number;
  show_teams: number;
  show_servers: number;
  discoverable: number;
  allow_profile_messages: number;
};
type BotPreferenceRow = RowDataPacket & {
  dm_reminders_enabled: number;
  signup_reminders: number;
  checkin_reminders: number;
  match_reminders: number;
  result_reminders: number;
};

export default async function SettingsPage() {
  const session = await requireSession();
  const [rows, botPreferenceRows] = await Promise.all([
    query<ProfileRow[]>(
      `SELECT u.site_username, u.bio, u.banner_url, u.main_platform, u.profile_visibility,
              up.timezone, up.time_format, up.show_game_identities, up.show_event_history,
              up.show_teams, up.show_servers, up.discoverable, up.allow_profile_messages
       FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [session.userId],
    ),
    query<BotPreferenceRow[]>(
      `SELECT dm_reminders_enabled, signup_reminders, checkin_reminders, match_reminders, result_reminders
       FROM user_discord_bot_preferences WHERE user_id = ? LIMIT 1`,
      [session.userId],
    ).catch(() => [] as BotPreferenceRow[]),
  ]);
  const profile = rows[0];
  const botPreferences = botPreferenceRows[0];

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Account and privacy</span><h1>Profile settings</h1><p>Control your public site identity, local time, discovery, and what appears on your profile.</p></div>
        {profile?.site_username ? <Link className="button button-secondary" href={`/users/${profile.site_username}`}>View public profile</Link> : null}
      </section>
      <ProfileSettingsForm initial={{
        siteUsername: profile?.site_username ?? session.username.toLowerCase(),
        bio: profile?.bio ?? "",
        bannerUrl: profile?.banner_url ?? "",
        mainPlatform: profile?.main_platform ?? "",
        timezone: profile?.timezone ?? "",
        timeFormat: profile?.time_format ?? "AUTO",
        profileVisibility: profile?.profile_visibility ?? "PUBLIC",
        showGameIdentities: Boolean(profile?.show_game_identities ?? 1),
        showEventHistory: Boolean(profile?.show_event_history ?? 1),
        showTeams: Boolean(profile?.show_teams ?? 1),
        showServers: Boolean(profile?.show_servers ?? 1),
        discoverable: Boolean(profile?.discoverable ?? 1),
        allowProfileMessages: Boolean(profile?.allow_profile_messages ?? 1),
      }} />
      <DiscordBotPreferencesForm initial={{
        dmRemindersEnabled: Boolean(botPreferences?.dm_reminders_enabled ?? 0),
        signupReminders: Boolean(botPreferences?.signup_reminders ?? 1),
        checkinReminders: Boolean(botPreferences?.checkin_reminders ?? 1),
        matchReminders: Boolean(botPreferences?.match_reminders ?? 1),
        resultReminders: Boolean(botPreferences?.result_reminders ?? 1),
      }} />
    </div>
  );
}
