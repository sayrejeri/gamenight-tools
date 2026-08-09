import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({ status: z.enum(["PENDING", "APPROVED", "WAITLISTED", "REJECTED", "NO_SHOW", "DISQUALIFIED"]) });
type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string };

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string; userId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId, userId } = await context.params;
  if (!/^\d+$/.test(userId)) return NextResponse.json({ error: "Invalid participant." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid participant status." }, { status: 400 });

  const events = await query<EventRow[]>(`SELECT workspace_id, primary_host_id FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId
    || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_PARTICIPANTS")
    || ["FULL", "SIGNUPS", "SCOREKEEPER"].includes(cohost[0]?.permission_level ?? "");
  if (!allowed) return NextResponse.json({ error: "Participant-management permission is required." }, { status: 403 });

  const [result] = await getPool().execute(
    `UPDATE event_participants SET status = ?, checked_in_at = IF(? IN ('REJECTED', 'NO_SHOW', 'DISQUALIFIED'), NULL, checked_in_at)
     WHERE event_id = ? AND user_id = ?`, [parsed.data.status, parsed.data.status, eventId, userId],
  );
  if ((result as { affectedRows?: number }).affectedRows !== 1) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.participant.status_changed", targetType: "user", targetId: userId, details: { status: parsed.data.status } });
  return NextResponse.json({ success: true, status: parsed.data.status });
}
