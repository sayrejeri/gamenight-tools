import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withTransaction } from "@/lib/db";
import { isAuthorizedBotWorker } from "@/lib/bot-worker-auth";

type JobRow = RowDataPacket & {
  id: string;
  job_type: string;
  payload_json: string | null;
  attempts: number;
  workspace_id: string | null;
  event_id: string | null;
  discord_guild_id: string | null;
  target_discord_id: string | null;
  announcement_channel_id: string | null;
  match_category_id: string | null;
  competitor_role_id: string | null;
  champion_role_id: string | null;
};

export async function POST(request: NextRequest) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { workerId?: string; workerVersion?: string; metadata?: unknown; limit?: number };
  const workerId = typeof body.workerId === "string" && body.workerId.trim() ? body.workerId.trim().slice(0, 120) : "four-seasons-worker";
  const workerVersion = typeof body.workerVersion === "string" && body.workerVersion.trim() ? body.workerVersion.trim().slice(0, 40) : null;
  const metadataJson = body.metadata === undefined ? null : JSON.stringify(body.metadata).slice(0, 4000);
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));

  const jobs = await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO discord_bot_workers (worker_id, version, metadata_json, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         version = VALUES(version), metadata_json = VALUES(metadata_json), last_seen_at = CURRENT_TIMESTAMP(3)`,
      [workerId, workerVersion, metadataJson],
    );

    await connection.execute(
      `UPDATE discord_bot_jobs
       SET status = CASE WHEN attempts >= 5 THEN 'FAILED' ELSE 'PENDING' END,
           locked_at = NULL, locked_by = NULL,
           last_error = COALESCE(last_error, 'Worker lock expired before completion.')
       WHERE status = 'PROCESSING' AND locked_at < (CURRENT_TIMESTAMP(3) - INTERVAL 10 MINUTE)`,
    );

    const [rows] = await connection.query<JobRow[]>(
      `SELECT j.id, j.job_type, j.payload_json, j.attempts, j.workspace_id, j.event_id,
              w.discord_guild_id, u.discord_id AS target_discord_id,
              wbs.announcement_channel_id, wbs.match_category_id, wbs.competitor_role_id, wbs.champion_role_id
       FROM discord_bot_jobs j
       LEFT JOIN workspaces w ON w.id = j.workspace_id
       LEFT JOIN users u ON u.id = j.user_id
       LEFT JOIN workspace_bot_settings wbs ON wbs.workspace_id = j.workspace_id
       WHERE j.status = 'PENDING' AND j.scheduled_at <= CURRENT_TIMESTAMP(3) AND j.attempts < 5
       ORDER BY j.scheduled_at ASC, j.created_at ASC
       LIMIT ? FOR UPDATE`,
      [limit],
    );

    if (!rows.length) return [] as JobRow[];
    const ids = rows.map((row) => row.id);
    await connection.query(
      `UPDATE discord_bot_jobs
       SET status = 'PROCESSING', attempts = attempts + 1, locked_at = CURRENT_TIMESTAMP(3), locked_by = ?
       WHERE id IN (${ids.map(() => "?").join(",")})`,
      [workerId, ...ids],
    );
    return rows;
  });

  return NextResponse.json({
    workerId,
    jobs: jobs.map((job) => {
      let payload: unknown = null;
      if (job.payload_json) {
        try { payload = JSON.parse(job.payload_json); }
        catch { payload = null; }
      }
      return {
        id: job.id,
        jobType: job.job_type,
        attempts: Number(job.attempts) + 1,
        workspaceId: job.workspace_id,
        eventId: job.event_id,
        discordGuildId: job.discord_guild_id,
        targetDiscordId: job.target_discord_id,
        announcementChannelId: job.announcement_channel_id,
        matchCategoryId: job.match_category_id,
        competitorRoleId: job.competitor_role_id,
        championRoleId: job.champion_role_id,
        payload,
      };
    }),
  });
}
