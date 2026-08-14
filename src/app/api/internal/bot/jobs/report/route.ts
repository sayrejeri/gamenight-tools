import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { isAuthorizedBotWorker } from "@/lib/bot-worker-auth";

const schema = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),
  retryable: z.boolean().optional().default(true),
  error: z.string().max(1000).nullable().optional().default(null),
});

export async function POST(request: NextRequest) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid worker result." }, { status: 400 });

  const rows = await query<(import("mysql2").RowDataPacket & { attempts: number })[]>(
    `SELECT attempts FROM discord_bot_jobs WHERE id = ? AND status = 'PROCESSING' LIMIT 1`,
    [parsed.data.jobId],
  );
  const current = rows[0];
  if (!current) return NextResponse.json({ error: "Processing bot job was not found." }, { status: 404 });

  if (parsed.data.success) {
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
