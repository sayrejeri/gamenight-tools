import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { isAuthorizedBotWorker } from "@/lib/bot-worker-auth";

const schema = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),
  retryable: z.boolean().optional().default(true),
  error: z.string().max(1000).nullable().optional().default(null),
  result: z.record(z.string(), z.unknown()).nullable().optional().default(null),
});

type JobRow = RowDataPacket & {
  attempts: number;
  job_type: string;
  workspace_id: string | null;
  event_id: string | null;
  payload_json: string | null;
};

function parsePayload(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid worker result." }, { status: 400 });

  const rows = await query<JobRow[]>(
    `SELECT attempts, job_type, workspace_id, event_id, payload_json
     FROM discord_bot_jobs WHERE id = ? AND status = 'PROCESSING' LIMIT 1`,
    [parsed.data.jobId],
  );
  const current = rows[0];
  if (!current) return NextResponse.json({ error: "Processing bot job was not found." }, { status: 404 });

  if (parsed.data.success) {
    const payload = parsePayload(current.payload_json);
    if (current.job_type === "CREATE_MATCH_CHANNEL") {
      const matchId = typeof payload.matchId === "string" ? payload.matchId : "";
      const channelId = typeof parsed.data.result?.channelId === "string" ? parsed.data.result.channelId : "";
      if (!z.string().uuid().safeParse(matchId).success || !/^\d{15,25}$/.test(channelId) || !current.workspace_id || !current.event_id) {
        return NextResponse.json({ error: "Match-channel worker result is incomplete." }, { status: 400 });
      }
      await withTransaction(async (connection) => {
        await connection.execute(
          `INSERT INTO discord_match_channels (match_id, workspace_id, event_id, channel_id, status, created_at, deleted_at)
           VALUES (?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP(3), NULL)
           ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), status = 'ACTIVE', deleted_at = NULL`,
          [matchId, current.workspace_id, current.event_id, channelId],
        );
        await connection.execute(
          `UPDATE discord_bot_jobs
           SET status = 'SENT', completed_at = CURRENT_TIMESTAMP(3), locked_at = NULL, locked_by = NULL, last_error = NULL
           WHERE id = ? AND status = 'PROCESSING'`,
          [parsed.data.jobId],
        );
      });
      return NextResponse.json({ success: true, status: "SENT" });
    }

    if (current.job_type === "DELETE_MATCH_CHANNEL") {
      const matchId = typeof payload.matchId === "string" ? payload.matchId : "";
      if (z.string().uuid().safeParse(matchId).success) {
        await withTransaction(async (connection) => {
          await connection.execute(
            `UPDATE discord_match_channels SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP(3) WHERE match_id = ?`,
            [matchId],
          );
          await connection.execute(
            `UPDATE discord_bot_jobs
             SET status = 'SENT', completed_at = CURRENT_TIMESTAMP(3), locked_at = NULL, locked_by = NULL, last_error = NULL
             WHERE id = ? AND status = 'PROCESSING'`,
            [parsed.data.jobId],
          );
        });
        return NextResponse.json({ success: true, status: "SENT" });
      }
    }

    await query(
      `UPDATE discord_bot_jobs
       SET status = 'SENT', completed_at = CURRENT_TIMESTAMP(3), locked_at = NULL, locked_by = NULL, last_error = NULL
       WHERE id = ? AND status = 'PROCESSING'`,
      [parsed.data.jobId],
    );
    return NextResponse.json({ success: true, status: "SENT" });
  }

  const shouldRetry = parsed.data.retryable && Number(current.attempts) < 5;
  await query(
    `UPDATE discord_bot_jobs
     SET status = ?, scheduled_at = CASE WHEN ? = 1 THEN (CURRENT_TIMESTAMP(3) + INTERVAL 2 MINUTE) ELSE scheduled_at END,
         completed_at = CASE WHEN ? = 1 THEN NULL ELSE CURRENT_TIMESTAMP(3) END,
         locked_at = NULL, locked_by = NULL, last_error = ?
     WHERE id = ? AND status = 'PROCESSING'`,
    [shouldRetry ? "PENDING" : "FAILED", shouldRetry ? 1 : 0, shouldRetry ? 1 : 0, parsed.data.error ?? "Discord bot worker reported a failure.", parsed.data.jobId],
  );
  return NextResponse.json({ success: true, status: shouldRetry ? "PENDING" : "FAILED" });
}
