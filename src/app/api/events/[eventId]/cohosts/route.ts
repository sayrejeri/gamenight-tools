import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const inviteSchema = z.object({
  discordId: z.string().regex(/^\d{15,25}$/),
  permissionLevel: z.enum(["FULL", "BRACKET", "SIGNUPS", "SCOREKEEPER", "ANNOUNCEMENTS", "VIEW_ONLY"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

type EventAccessRow = RowDataPacket & {
  workspace_id: string;
  primary_host_id: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { eventId } = await context.params;
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid co-host invitation." }, { status: 400 });

  const rows = await query<EventAccessRow[]>(
    `SELECT workspace_id, primary_host_id FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const role = await getWorkspaceRole(session.userId, event.workspace_id);
  const isPrimaryHost = event.primary_host_id === session.userId;
  const fullCohostRows = await query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' AND permission_level = 'FULL'
     LIMIT 1`,
    [eventId, session.userId],
  );
  const isFullCohost = Boolean(fullCohostRows[0]);
  if (!isPrimaryHost && !isFullCohost && !canManageCodes(role)) {
    return NextResponse.json({ error: "Only the main host, a full co-host, or server staff can invite co-hosts." }, { status: 403 });
  }

  const [userRows] = await query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM users WHERE discord_id = ? LIMIT 1`,
    [parsed.data.discordId],
  );

  const invitationId = randomUUID();
  await getPool().execute(
    `INSERT INTO event_cohosts
      (id, event_id, invited_user_id, invited_discord_id, permission_level, status, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
     ON DUPLICATE KEY UPDATE
       invited_user_id = VALUES(invited_user_id),
       permission_level = VALUES(permission_level),
       status = 'PENDING',
       invited_by = VALUES(invited_by),
       expires_at = VALUES(expires_at),
       responded_at = NULL`,
    [
      invitationId,
      eventId,
      userRows[0]?.id ?? null,
      parsed.data.discordId,
      parsed.data.permissionLevel,
      session.userId,
      parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    ],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: event.workspace_id,
    eventId,
    action: "event.cohost_invited",
    targetType: "discord_user",
    targetId: parsed.data.discordId,
    details: { permissionLevel: parsed.data.permissionLevel },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
