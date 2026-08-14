import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { buildDiscordBotInstallUrl, isDiscordBotConfigured } from "@/lib/discord-bot";
import { hasWorkspacePermission } from "@/lib/permissions";
import { DiscordBotSetupCard } from "@/components/discord-bot-setup-card";
import { WorkspaceBotQueueActions } from "@/components/workspace-bot-queue-actions";
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
type WorkerRow = RowDataPacket & { worker_id: string; version: string | null; last_seen_at: Date };
type QueueRow = RowDataPacket & { pending_count: number; processing_count: number; failed_count: number };
type JobActivityRow = RowDataPacket & {
  id: string;
  job_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  completed_at: Date | null;
};

export default async function WorkspaceBotPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await requireSession();
  const { workspaceId } = await params;
  if (!await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE")) notFound();

  const [workspaces, settingsRows, workerRows, queueRows, recentJobs] = await Promise.all([
    query<WorkspaceRow[]>(`SELECT id, name, discord_guild_id, bot_connected, profile_status FROM workspaces WHERE id = ? LIMIT 1`, [workspaceId]),
    query<SettingsRow[]>(
      `SELECT dm_reminders_enabled, announcements_enabled, temporary_match_channels_enabled, role_sync_enabled,
              announcement_channel_id, match_category_id, competitor_role_id, champion_role_id
       FROM workspace_bot_settings WHERE workspace_id = ? LIMIT 1`,
      [workspaceId],
    ).catch(() => [] as SettingsRow[]),
    query<WorkerRow[]>(
      `SELECT worker_id, version, last_seen_at FROM discord_bot_workers ORDER BY last_seen_at DESC LIMIT 1`,
    ).catch(() => [] as WorkerRow[]),
    query<QueueRow[]>(
      `SELECT
         SUM(status = 'PENDING') AS pending_count,
         SUM(status = 'PROCESSING') AS processing_count,
         SUM(status = 'FAILED') AS failed_count
       FROM discord_bot_jobs WHERE workspace_id = ?`,
      [workspaceId],
    ).catch(() => [] as QueueRow[]),
    query<JobActivityRow[]>(
      `SELECT id, job_type, status, attempts, last_error, created_at, completed_at
       FROM discord_bot_jobs WHERE workspace_id = ?
       ORDER BY created_at DESC LIMIT 12`,
      [workspaceId],
    ).catch(() => [] as JobActivityRow[]),
  ]);
  const workspace = workspaces[0];
  if (!workspace || workspace.profile_status === "ARCHIVED") notFound();
  const settings = settingsRows[0];
  const worker = workerRows[0];
  const queue = queueRows[0];
  const configured = isDiscordBotConfigured();
  const workerLastSeen = worker?.last_seen_at ? new Date(worker.last_seen_at) : null;
  const workerOnline = Boolean(workerLastSeen && Date.now() - workerLastSeen.getTime() <= 90_000);
  const pendingCount = Number(queue?.pending_count ?? 0);
  const processingCount = Number(queue?.processing_count ?? 0);
  const failedCount = Number(queue?.failed_count ?? 0);

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Discord integration</span><h1>{workspace.name} bot settings</h1><p>Install the optional bot, verify its connection, then choose exactly which automation features this server wants to use.</p></div>
        <Link className="button button-secondary" href={`/dashboard/workspaces/${workspaceId}`}>Back to server</Link>
      </section>

      <DiscordBotSetupCard workspaceId={workspaceId} configured={configured} connected={Boolean(workspace.bot_connected)} installUrl={buildDiscordBotInstallUrl(workspace.discord_guild_id)} showSettingsLink={false} />

      <section className="panel section-stack">
        <div className="section-header"><div><span className="card-kicker">Background delivery</span><h2>Worker health</h2><p>Discord installation and the Four Seasons background worker are tracked separately.</p></div><span className="badge">{workerOnline ? "Worker online" : worker ? "Worker offline" : "Worker not seen"}</span></div>
        <div className="staff-stat-grid">
          <article className="stat-card"><strong>{workerOnline ? "ONLINE" : "OFFLINE"}</strong><span>{worker?.worker_id ?? "No worker heartbeat"}</span></article>
          <article className="stat-card"><strong>{worker?.version ?? "—"}</strong><span>Worker version</span></article>
          <article className="stat-card"><strong>{pendingCount + processingCount}</strong><span>Queued / processing</span></article>
          <article className="stat-card"><strong>{failedCount}</strong><span>Failed jobs</span></article>
        </div>
        <p className="muted">{workerLastSeen ? `Last heartbeat: ${workerLastSeen.toLocaleString()}` : "The website has not received a worker heartbeat yet. Start the Four Seasons worker after the v1.0 website and migration are deployed."}</p>
        <WorkspaceBotQueueActions workspaceId={workspaceId} failedCount={failedCount} pendingCount={pendingCount} />
      </section>

      {recentJobs.length ? <section className="panel section-stack">
        <div className="section-header"><div><span className="card-kicker">Delivery history</span><h2>Recent bot jobs</h2><p>The latest queue activity for this server. Cancelled jobs are usually stale work that failed the final delivery-time safety check.</p></div></div>
        <div className="compact-list">
          {recentJobs.map((job) => <article className="list-card" key={job.id}>
            <span className="list-icon" aria-hidden="true">{job.status === "SENT" ? "✓" : job.status === "FAILED" ? "!" : job.status === "CANCELLED" ? "×" : "…"}</span>
            <div>
              <strong>{job.job_type.replaceAll("_", " ")}</strong>
              <span>{job.status} · {job.attempts} attempt{job.attempts === 1 ? "" : "s"} · created {new Date(job.created_at).toLocaleString()}</span>
              {job.last_error ? <small>{job.last_error}</small> : job.completed_at ? <small>Completed {new Date(job.completed_at).toLocaleString()}</small> : null}
            </div>
            <span className="badge">{job.status}</span>
          </article>)}
        </div>
      </section> : null}

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

      <section className="rule-callout"><strong>Safe beta defaults</strong><p>Every automation toggle starts disabled. Members also have to opt into Discord DMs individually. A bot permission failure is isolated from the event/tournament state and can be retried after the Discord configuration is fixed.</p></section>
    </div>
  );
}
