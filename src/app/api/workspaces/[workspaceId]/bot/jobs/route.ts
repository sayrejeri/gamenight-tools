import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";

const schema = z.object({ action: z.enum(["RETRY_FAILED", "CANCEL_PENDING"]) });

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE")) {
    return NextResponse.json({ error: "Manage Server Profile permission is required." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid bot queue action." }, { status: 400 });

  const affected = await withTransaction(async (connection) => {
    const [result] = parsed.data.action === "RETRY_FAILED"
      ? await connection.execute(
          `UPDATE discord_bot_jobs
           SET status = 'PENDING', attempts = 0, scheduled_at = CURRENT_TIMESTAMP(3), completed_at = NULL,
               locked_at = NULL, locked_by = NULL, last_error = NULL
           WHERE workspace_id = ? AND status = 'FAILED'`,
          [workspaceId],
        )
      : await connection.execute(
          `UPDATE discord_bot_jobs
           SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP(3), locked_at = NULL, locked_by = NULL,
               last_error = 'Cancelled manually by a workspace manager.'
           WHERE workspace_id = ? AND status = 'PENDING'`,
          [workspaceId],
        );

    const count = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    await writeAuditLog({
      actorUserId: session.userId,
      action: parsed.data.action === "RETRY_FAILED" ? "workspace.bot.jobs.retry_failed" : "workspace.bot.jobs.cancel_pending",
      workspaceId,
      targetType: "WORKSPACE",
      targetId: workspaceId,
      severity: "INFO",
      details: { affected: count },
    }, connection);
    return count;
  });

  return NextResponse.json({ success: true, affected });
}
