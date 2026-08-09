import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const inviteSchema = z.object({
  identity: z.string().trim().min(2).max(80),
  permissionLevel: z.enum(["FULL", "BRACKET", "SIGNUPS", "SCOREKEEPER", "ANNOUNCEMENTS", "VIEW_ONLY"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

type EventAccessRow = RowDataPacket & { workspace_id: string; primary_host_id: string; name: string };
type ResolvedUserRow = RowDataPacket & { id: string; discord_id: string; username: string; global_name: string | null; site_username: string | null };

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid site username, Discord username, or Discord ID." }, { status: 400 });

  const rows = await query<EventAccessRow[]>(`SELECT workspace_id, primary_host_id, name FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = rows[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const isPrimaryHost = event.primary_host_id === session.userId;
  const fullCohostRows = await query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' AND permission_level = 'FULL' LIMIT 1`,
    [eventId, session.userId],
  );
  const isFullCohost = Boolean(fullCohostRows[0]);
  const canManageEvent = await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_EVENTS");
  if (!isPrimaryHost && !isFullCohost && !canManageEvent) return NextResponse.json({ error: "Event-management permission is required to invite co-hosts." }, { status: 403 });

  const identity = parsed.data.identity.replace(/^@/, "").trim();
  const numericDiscordId = /^\d{15,25}$/.test(identity);
  const resolvedRows = await query<ResolvedUserRow[]>(
    `SELECT id, discord_id, username, global_name, site_username FROM users
     WHERE discord_id = ? OR LOWER(site_username) = LOWER(?) OR LOWER(username) = LOWER(?)
     ORDER BY CASE WHEN discord_id = ? THEN 0 WHEN LOWER(site_username) = LOWER(?) THEN 1 WHEN LOWER(username) = LOWER(?) THEN 2 ELSE 3 END LIMIT 1`,
    [identity, identity, identity, identity, identity, identity],
  );
  const invitedUser = resolvedRows[0] ?? null;
  if (!invitedUser && !numericDiscordId) return NextResponse.json({ error: "That user has not signed into Game Night Tools yet. Use their numeric Discord ID to create a pending invitation." }, { status: 404 });

  const discordId = invitedUser?.discord_id ?? identity;
  if (discordId === session.discordId) return NextResponse.json({ error: "You cannot invite yourself as a co-host." }, { status: 409 });

  const invitationId = randomUUID();
  await getPool().execute(
    `INSERT INTO event_cohosts (id, event_id, invited_user_id, invited_discord_id, permission_level, status, invited_by, expires_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
     ON DUPLICATE KEY UPDATE invited_user_id = VALUES(invited_user_id), permission_level = VALUES(permission_level), status = 'PENDING',
       invited_by = VALUES(invited_by), expires_at = VALUES(expires_at), responded_at = NULL`,
    [invitationId, eventId, invitedUser?.id ?? null, discordId, parsed.data.permissionLevel, session.userId, parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null],
  );

  if (invitedUser) {
    await getPool().execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'COHOST_INVITE', 'EVENTS', 'Co-host invitation', ?, ?)`,
      [randomUUID(), invitedUser.id, `You were invited to co-host ${event.name} with ${parsed.data.permissionLevel.replaceAll("_", " ").toLowerCase()} access.`, `/dashboard/events/${eventId}`],
    );
  }

  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.cohost_invited", targetType: invitedUser ? "user" : "discord_user", targetId: invitedUser?.id ?? discordId, details: { permissionLevel: parsed.data.permissionLevel, discordId } });
  return NextResponse.json({ success: true, invitedName: invitedUser ? (invitedUser.global_name ?? invitedUser.site_username ?? invitedUser.username) : null }, { status: 201 });
}
