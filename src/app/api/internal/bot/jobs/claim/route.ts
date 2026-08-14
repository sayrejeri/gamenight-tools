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
  match_id: string | null;
  discord_guild_id: string | null;
  target_discord_id: string | null;
  bot_connected: number;
  dm_reminders_enabled: number;
  announcements_enabled: number;
  temporary_match_channels_enabled: number;
  role_sync_enabled: number;
  announcement_channel_id: string | null;
  match_category_id: string | null;
  competitor_role_id: string | null;
  champion_role_id: string | null;
  user_dm_reminders_enabled: number;
  signup_reminders: number;
  checkin_reminders: number;
  match_reminders: number;
  result_reminders: number;
  event_status: string | null;
  event_visibility: string | null;
  participant_status: string | null;
  participant_checked_in_at: Date | null;
  match_status: string | null;
  match_scheduled_at: Date | null;
  active_match_channel: number;
  team_registered: number;
  champion_member: number;
  has_active_competition: number;
};

type Payload = Record<string, unknown>;

const ACTIVE_EVENT_STATUSES = new Set(["SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE", "POSTPONED"]);

function parsePayload(value: string | null): Payload {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Payload : {};
  } catch {
    return {};
  }
}

function isSnowflake(value: string | null): value is string {
  return Boolean(value && /^\d{15,25}$/.test(value));
}

function isPublicAnnouncementEvent(job: JobRow): boolean {
  return job.event_visibility === "SERVER" || job.event_visibility === "PUBLIC";
}

function matchReminderStillTimely(value: Date | null): boolean {
  if (!value) return false;
  const delta = new Date(value).getTime() - Date.now();
  return delta >= -15 * 60_000 && delta <= 60 * 60_000;
}

function isJobAllowed(job: JobRow, payload: Payload): boolean {
  if (job.workspace_id && !job.bot_connected) return false;

  if (job.job_type.startsWith("DM_")) {
    if (!isSnowflake(job.target_discord_id) || !job.dm_reminders_enabled || !job.user_dm_reminders_enabled) return false;
    if (job.job_type === "DM_SIGNUP_REMINDER") {
      return Boolean(job.signup_reminders && job.participant_status === "APPROVED" && ["SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN"].includes(job.event_status ?? ""));
    }
    if (job.job_type === "DM_CHECKIN_REMINDER") {
      return Boolean(job.checkin_reminders && job.event_status === "CHECK_IN_OPEN" && job.participant_status === "APPROVED" && !job.participant_checked_in_at);
    }
    if (job.job_type === "DM_MATCH_REMINDER") {
      return Boolean(job.match_reminders && ["PENDING", "READY"].includes(job.match_status ?? "") && matchReminderStillTimely(job.match_scheduled_at));
    }
    if (job.job_type === "DM_RESULT_REMINDER") {
      return Boolean(job.result_reminders && job.match_status === "AWAITING_CONFIRMATION");
    }
    return false;
  }

  if (job.job_type.startsWith("ANNOUNCE_")) {
    if (!job.announcements_enabled || !isSnowflake(job.announcement_channel_id) || !isPublicAnnouncementEvent(job)) return false;
    if (job.job_type === "ANNOUNCE_EVENT") return ["SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE"].includes(job.event_status ?? "");
    if (job.job_type === "ANNOUNCE_MATCH_READY") return job.event_status === "LIVE" && ["READY", "LIVE"].includes(job.match_status ?? "");
    if (job.job_type === "ANNOUNCE_RESULT") return ["COMPLETED", "FORFEIT"].includes(job.match_status ?? "");
    if (job.job_type === "ANNOUNCE_WINNER") return job.event_status !== "CANCELLED";
    return false;
  }

  if (job.job_type === "CREATE_MATCH_CHANNEL") {
    return Boolean(
      job.temporary_match_channels_enabled
      && isSnowflake(job.match_category_id)
      && job.event_status === "LIVE"
      && ["READY", "LIVE"].includes(job.match_status ?? "")
      && !job.active_match_channel,
    );
  }

  if (job.job_type === "DELETE_MATCH_CHANNEL") {
    // Cleanup remains valid even when creation has since been disabled.
    return Boolean(job.active_match_channel);
  }

  if (job.job_type === "SYNC_ROLE") {
    if (!job.role_sync_enabled || !isSnowflake(job.target_discord_id)) return false;
    const roleKind = payload.roleKind === "CHAMPION" ? "CHAMPION" : "COMPETITOR";
    const action = payload.action === "REMOVE" ? "REMOVE" : "ADD";
    if (roleKind === "CHAMPION") {
      return Boolean(isSnowflake(job.champion_role_id) && action === "ADD" && job.champion_member);
    }
    if (!isSnowflake(job.competitor_role_id)) return false;
    if (action === "ADD") {
      return Boolean(job.event_status && ACTIVE_EVENT_STATUSES.has(job.event_status) && (job.participant_status === "APPROVED" || job.team_registered));
    }
    return Boolean(["COMPLETED", "CANCELLED"].includes(job.event_status ?? "") && !job.has_active_competition);
  }

  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { workerId?: string; workerVersion?: string; metadata?: unknown; limit?: number };
  const workerId = typeof body.workerId === "string" && body.workerId.trim() ? body.workerId.trim().slice(0, 120) : "four-seasons-worker";
  const workerVersion = typeof body.workerVersion === "string" && body.workerVersion.trim() ? body.workerVersion.trim().slice(0, 40) : null;
  const metadataJson = body.metadata === undefined ? null : JSON.stringify(body.metadata).slice(0, 4000);
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));
  const candidateLimit = Math.min(80, limit * 4);

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
       WHERE status = 'PROCESSING' AND locked_at < (CURRENT_TIMESTAMP(3) - INTERVAL 2 MINUTE)`,
    );

    const [rows] = await connection.query<JobRow[]>(
      `SELECT j.id, j.job_type, j.payload_json, j.attempts, j.workspace_id, j.event_id, j.match_id,
              w.discord_guild_id, u.discord_id AS target_discord_id, COALESCE(w.bot_connected, 0) AS bot_connected,
              COALESCE(wbs.dm_reminders_enabled, 0) AS dm_reminders_enabled,
              COALESCE(wbs.announcements_enabled, 0) AS announcements_enabled,
              COALESCE(wbs.temporary_match_channels_enabled, 0) AS temporary_match_channels_enabled,
              COALESCE(wbs.role_sync_enabled, 0) AS role_sync_enabled,
              wbs.announcement_channel_id, wbs.match_category_id, wbs.competitor_role_id, wbs.champion_role_id,
              COALESCE(ubp.dm_reminders_enabled, 0) AS user_dm_reminders_enabled,
              COALESCE(ubp.signup_reminders, 0) AS signup_reminders,
              COALESCE(ubp.checkin_reminders, 0) AS checkin_reminders,
              COALESCE(ubp.match_reminders, 0) AS match_reminders,
              COALESCE(ubp.result_reminders, 0) AS result_reminders,
              e.status AS event_status, e.visibility AS event_visibility,
              ep.status AS participant_status, ep.checked_in_at AS participant_checked_in_at,
              bm.status AS match_status, bm.scheduled_at AS match_scheduled_at,
              EXISTS(
                SELECT 1 FROM discord_match_channels dmc
                WHERE dmc.match_id = j.match_id AND dmc.status = 'ACTIVE'
              ) AS active_match_channel,
              EXISTS(
                SELECT 1 FROM event_team_entries ete
                WHERE ete.event_id = j.event_id AND ete.status = 'REGISTERED'
                  AND JSON_SEARCH(ete.roster_json, 'one', CAST(j.user_id AS CHAR), NULL, '$[*].userId') IS NOT NULL
              ) AS team_registered,
              EXISTS(
                SELECT 1
                FROM bracket_entries cbe
                INNER JOIN brackets cbr ON cbr.id = cbe.bracket_id
                WHERE cbr.event_id = j.event_id AND cbr.status = 'COMPLETED' AND cbe.status = 'ADVANCED'
                  AND (
                    cbe.user_id = j.user_id
                    OR EXISTS(
                      SELECT 1 FROM event_team_entries cte
                      WHERE cte.event_id = j.event_id AND cte.team_id = cbe.team_id AND cte.status = 'REGISTERED'
                        AND JSON_SEARCH(cte.roster_json, 'one', CAST(j.user_id AS CHAR), NULL, '$[*].userId') IS NOT NULL
                    )
                  )
              ) AS champion_member,
              EXISTS(
                SELECT 1 FROM events ae
                WHERE ae.workspace_id = j.workspace_id
                  AND ae.status IN ('SIGNUPS_OPEN','SIGNUPS_CLOSED','CHECK_IN_OPEN','LIVE','POSTPONED')
                  AND (
                    EXISTS(
                      SELECT 1 FROM event_participants aep
                      WHERE aep.event_id = ae.id AND aep.user_id = j.user_id AND aep.status = 'APPROVED'
                    )
                    OR EXISTS(
                      SELECT 1 FROM event_team_entries aete
                      WHERE aete.event_id = ae.id AND aete.status = 'REGISTERED'
                        AND JSON_SEARCH(aete.roster_json, 'one', CAST(j.user_id AS CHAR), NULL, '$[*].userId') IS NOT NULL
                    )
                  )
              ) AS has_active_competition
       FROM discord_bot_jobs j
       LEFT JOIN workspaces w ON w.id = j.workspace_id
       LEFT JOIN users u ON u.id = j.user_id
       LEFT JOIN workspace_bot_settings wbs ON wbs.workspace_id = j.workspace_id
       LEFT JOIN user_discord_bot_preferences ubp ON ubp.user_id = j.user_id
       LEFT JOIN events e ON e.id = j.event_id
       LEFT JOIN event_participants ep ON ep.event_id = j.event_id AND ep.user_id = j.user_id
       LEFT JOIN bracket_matches bm ON bm.id = j.match_id
       WHERE j.status = 'PENDING' AND j.scheduled_at <= CURRENT_TIMESTAMP(3) AND j.attempts < 5
       ORDER BY j.scheduled_at ASC, j.created_at ASC
       LIMIT ? FOR UPDATE`,
      [candidateLimit],
    );

    if (!rows.length) return [] as JobRow[];

    const selected: JobRow[] = [];
    const cancelledIds: string[] = [];
    const creatingMatches = new Set<string>();
    for (const row of rows) {
      const payload = parsePayload(row.payload_json);
      let allowed = isJobAllowed(row, payload);
      if (allowed && row.job_type === "CREATE_MATCH_CHANNEL" && row.match_id) {
        if (creatingMatches.has(row.match_id)) allowed = false;
        else creatingMatches.add(row.match_id);
      }
      if (allowed && selected.length < limit) selected.push(row);
      else if (!allowed) cancelledIds.push(row.id);
    }

    if (cancelledIds.length) {
      await connection.query(
        `UPDATE discord_bot_jobs
         SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP(3), locked_at = NULL, locked_by = NULL,
             last_error = 'Cancelled before delivery because current settings or competition state no longer allow this job.'
         WHERE id IN (${cancelledIds.map(() => "?").join(",")}) AND status = 'PENDING'`,
        cancelledIds,
      );
    }

    if (!selected.length) return [] as JobRow[];
    const ids = selected.map((row) => row.id);
    await connection.query(
      `UPDATE discord_bot_jobs
       SET status = 'PROCESSING', attempts = attempts + 1, locked_at = CURRENT_TIMESTAMP(3), locked_by = ?
       WHERE id IN (${ids.map(() => "?").join(",")}) AND status = 'PENDING'`,
      [workerId, ...ids],
    );
    return selected;
  });

  return NextResponse.json({
    workerId,
    jobs: jobs.map((job) => ({
      id: job.id,
      jobType: job.job_type,
      attempts: Number(job.attempts) + 1,
      workspaceId: job.workspace_id,
      eventId: job.event_id,
      matchId: job.match_id,
      discordGuildId: job.discord_guild_id,
      targetDiscordId: job.target_discord_id,
      announcementChannelId: job.announcement_channel_id,
      matchCategoryId: job.match_category_id,
      competitorRoleId: job.competitor_role_id,
      championRoleId: job.champion_role_id,
      payload: parsePayload(job.payload_json),
    })),
  });
}
