import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { ProfileSettingsForm } from "@/components/profile-settings-form";

type ProfileRow = RowDataPacket & {
  site_username: string | null;
  bio: string | null;
  banner_url: string | null;
  main_platform: string | null;
  profile_visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  onboarding_completed: number;
  timezone: string | null;
  time_format: "AUTO" | "12H" | "24H";
  show_game_identities: number;
  show_event_history: number;
  show_teams: number;
  show_servers: number;
  discoverable: number;
  allow_profile_messages: number;
};

export default async function OnboardingPage() {
  const session = await requireSession();
  const rows = await query<ProfileRow[]>(
    `SELECT u.site_username, u.bio, u.banner_url, u.main_platform, u.profile_visibility,
            u.onboarding_completed, up.timezone, up.time_format, up.show_game_identities,
            up.show_event_history, up.show_teams, up.show_servers, up.discoverable,
            up.allow_profile_messages
     FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [session.userId],
  );
  const profile = rows[0];
  if (!profile) redirect("/");
  if (profile.onboarding_completed) redirect("/dashboard");

  return (
    <div className="section-stack narrow-page">
      <section className="page-heading"><div><span className="eyebrow">Welcome to Game Night Tools</span><h1>Finish your profile</h1><p>Choose how other players, teams, and server hosts will see you. Everything can be changed later.</p></div></section>
      <ProfileSettingsForm onboarding initial={{
        siteUsername: profile.site_username ?? session.username.toLowerCase(),
        bio: profile.bio ?? "",
        bannerUrl: profile.banner_url ?? "",
        mainPlatform: profile.main_platform ?? "",
        timezone: profile.timezone ?? "",
        timeFormat: profile.time_format ?? "AUTO",
        profileVisibility: profile.profile_visibility ?? "PUBLIC",
        showGameIdentities: Boolean(profile.show_game_identities ?? 1),
        showEventHistory: Boolean(profile.show_event_history ?? 1),
        showTeams: Boolean(profile.show_teams ?? 1),
        showServers: Boolean(profile.show_servers ?? 1),
        discoverable: Boolean(profile.discoverable ?? 1),
        allowProfileMessages: Boolean(profile.allow_profile_messages ?? 1),
      }} />
    </div>
  );
}
