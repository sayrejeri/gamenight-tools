import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string; bracket_enabled: number };
type ShareRow = RowDataPacket & { token: string; is_enabled: number; expires_at: Date | null; created_at: Date };

async function getAccess(userId: string, eventId: string) {
  const events = await query<EventRow[]>(
    `SELECT workspace_id, CAST(primary_host_id AS CHAR) AS primary_host_id, bracket_enabled FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return { event: null, allowed: false };
  if (event.primary_host_id === userId
    || await hasWorkspacePermission(userId, event.workspace_id, "MANAGE_EVENTS")
    || await hasWorkspacePermission(userId, event.workspace_id, "MANAGE_BRACKETS")) {
    return { event, allowed: true };
  }
  const cohosts = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED'
       AND permission_level IN ('FULL', 'BRACKET') LIMIT 1`,
    [eventId, userId],
  );
  return { event, allowed: Boolean(cohosts[0]) };
}

function shareUrl(token: string): string {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return appUrl ? `${appUrl}/spectate/${token}` : `/spectate/${token}`;
}

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await getAccess(session.userId, eventId);
  if (!access.event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ error: "Tournament management permission is required." }, { status: 403 });
  const rows = await query<ShareRow[]>(
    `SELECT token, is_enabled, expires_at, created_at FROM event_public_share_links WHERE event_id = ? LIMIT 1`,
    [eventId],
  );
  const share = rows[0];
  return NextResponse.json({
    share: share ? {
      enabled: Boolean(share.is_enabled),
      url: shareUrl(share.token),
      expiresAt: share.expires_at ? new Date(share.expires_at).toISOString() : null,
      createdAt: new Date(share.created_at).toISOString(),
    } : null,
  });
}

export async function POST(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await getAccess(session.userId, eventId);
  if (!access.event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ error: "Tournament management permission is required." }, { status: 403 });
  if (!access.event.bracket_enabled) return NextResponse.json({ error: "Enable tournament competition tools before creating a spectator link." }, { status: 409 });

  const token = randomBytes(24).toString("hex");
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO event_public_share_links (event_id, token, is_enabled, created_by)
       VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE token = VALUES(token), is_enabled = 1, expires_at = NULL,
         created_by = VALUES(created_by), updated_at = CURRENT_TIMESTAMP(3)`,
      [eventId, token, session.userId],
    );
  });
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "event.spectator_link_generated",
    targetType: "event",
    targetId: eventId,
    details: { anonymousSpectators: true },
  });
  return NextResponse.json({ success: true, enabled: true, url: shareUrl(token) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const access = await getAccess(session.userId, eventId);
  if (!access.event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ error: "Tournament management permission is required." }, { status: 403 });

  await query(`UPDATE event_public_share_links SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP(3) WHERE event_id = ?`, [eventId]);
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: access.event.workspace_id,
    eventId,
    action: "event.spectator_link_revoked",
    targetType: "event",
    targetId: eventId,
  });
  return NextResponse.json({ success: true, enabled: false });
}
