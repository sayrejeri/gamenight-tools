import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { buildDiscordBotInstallUrl, isDiscordBotConfigured } from "@/lib/discord-bot";
import { hasWorkspacePermission } from "@/lib/permissions";
import { DiscordBotSetupCard } from "@/components/discord-bot-setup-card";
import { WorkspaceBotSettingsForm } from "@/components/workspace-bot-settings-form";

type WorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string; bot_connected: number; profile_status: string };
type SettingsRow = RowDataPacket & {
  dm_reminders_enabled: number;
  announcements_enabled: number;
  temporary_match_channels_enabled: number;
  role_sync_enabled: number;
  announcement_channel_id: string | null;
  match_category_id: string | null;
  competitor_role_id: string | null;
  champion_role_id: string | null;
};

export default async function WorkspaceBotPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await requireSession();
  const { workspaceId } = await params;
  if (!await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE")) notFound();

  const [workspaces, settingsRows] = await Promise.all([
    query<WorkspaceRow[]>(`SELECT id, name, discord_guild_id, bot_connected, profile_status FROM workspaces WHERE id = ? LIMIT 1`, [workspaceId]),
    query<SettingsRow[]>(
      `SELECT dm_reminders_enabled, announcements_enabled, temporary_match_channels_enabled, role_sync_enabled,
              announcement_channel_id, match_category_id, competitor_role_id, champion_role_id
       FROM workspace_bot_settings WHERE workspace_id = ? LIMIT 1`,
      [workspaceId],
    ).catch(() => [] as SettingsRow[]),
  ]);
  const workspace = workspaces[0];
  if (!workspace || workspace.profile_status === "ARCHIVED") notFound();
  const settings = settingsRows[0];
  const configured = isDiscordBotConfigured();

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Discord integration</span><h1>{workspace.name} bot settings</h1><p>Install the optional bot, verify its connection, then choose exactly which automation features this server wants to use.</p></div>
        <Link className="button button-secondary" href={`/dashboard/workspaces/${workspaceId}`}>Back to server</Link>
      </section>

      <DiscordBotSetupCard workspaceId={workspaceId} configured={configured} connected={Boolean(workspace.bot_connected)} installUrl={buildDiscordBotInstallUrl(workspace.discord_guild_id)} />

      <WorkspaceBotSettingsForm workspaceId={workspaceId} initial={{
        dmRemindersEnabled: Boolean(settings?.dm_reminders_enabled ?? 0),
        announcementsEnabled: Boolean(settings?.announcements_enabled ?? 0),
        temporaryMatchChannelsEnabled: Boolean(settings?.temporary_match_channels_enabled ?? 0),
        roleSyncEnabled: Boolean(settings?.role_sync_enabled ?? 0),
        announcementChannelId: settings?.announcement_channel_id ?? "",
        matchCategoryId: settings?.match_category_id ?? "",
        competitorRoleId: settings?.competitor_role_id ?? "",
        championRoleId: settings?.champion_role_id ?? "",
      }} />

      <section className="rule-callout"><strong>Safe beta defaults</strong><p>Every automation toggle starts disabled. Members also have to opt into Discord DMs individually. A bot permission failure should be logged and retried safely without changing tournament results or blocking the website.</p></section>
    </div>
  );
}
