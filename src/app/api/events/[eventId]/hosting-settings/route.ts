import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({ signupMode: z.enum(["AUTO", "APPROVAL"]) });
type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string; signup_mode: string };

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid hosting settings." }, { status: 400 });

  const rows = await query<EventRow[]>(`SELECT workspace_id, primary_host_id, signup_mode FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = rows[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId
    || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_EVENTS")
    || cohost[0]?.permission_level === "FULL";
  if (!allowed) return NextResponse.json({ error: "Event-management permission is required." }, { status: 403 });

  await getPool().execute(`UPDATE events SET signup_mode = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [parsed.data.signupMode, eventId]);
  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.signup_mode_changed", targetType: "event", targetId: eventId, details: { previousMode: event.signup_mode, signupMode: parsed.data.signupMode } });
  return NextResponse.json({ success: true, signupMode: parsed.data.signupMode });
}
