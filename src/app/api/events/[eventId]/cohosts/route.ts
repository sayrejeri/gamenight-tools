import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const permissionLevel = z.enum(["FULL", "BRACKET", "SIGNUPS", "SCOREKEEPER", "ANNOUNCEMENTS", "VIEW_ONLY"]);
const inviteSchema = z.object({
  identity: z.string().trim().min(2).max(80),
  permissionLevel,
  expiresAt: z.string().datetime().nullable().optional(),
});
const editSchema = z.object({
  cohostId: z.string().uuid(),
  permissionLevel,
  expiresAt: z.string().datetime().nullable().optional(),
});

type EventAccessRow = RowDataPacket & { workspace_id: string; primary_host_id: string; name: string };
type ResolvedUserRow = RowDataPacket & { id: string; discord_id: string; username: string; global_name: string | null; site_username: string | null };
type CohostRow = RowDataPacket & { id: string; invited_user_id: string | null; invited_discord_id: string; permission_level: string; status: string };

async function requireEventManager(userId: string, eventId: string) {
  const rows = await query<EventAccessRow[]>(`SELECT workspace_id, primary_host_id, name FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = rows[0];
  if (!event) return { event: null, allowed: false };
  const fullCohostRows = await query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' AND permission_level = 'FULL' LIMIT 1`,
    [eventId, userId],
  );
  const allowed = event.primary_host_id === userId || Boolean(fullCohostRows[0]) || await hasWorkspacePermission(userId, event.workspace_id, "MANAGE_EVENTS");
  return { event, allowed };
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid site username, Discord username, or Discord ID." }, { status: 400 });

  const { event, allowed } = await requireEventManager(session.userId, eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Event-management permission is required to invite co-hosts." }, { status: 403 });

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

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid co-host changes." }, { status: 400 });

  const { event, allowed } = await requireEventManager(session.userId, eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Event-management permission is required to edit co-hosts." }, { status: 403 });

  const rows = await query<CohostRow[]>(
    `SELECT id, CAST(invited_user_id AS CHAR) AS invited_user_id, invited_discord_id, permission_level, status
     FROM event_cohosts WHERE id = ? AND event_id = ? LIMIT 1`,
    [parsed.data.cohostId, eventId],
  );
  const cohost = rows[0];
  if (!cohost) return NextResponse.json({ error: "Co-host invitation not found." }, { status: 404 });
  if (["REVOKED", "DECLINED"].includes(cohost.status)) return NextResponse.json({ error: "That co-host invitation is no longer active." }, { status: 409 });

  await getPool().execute(
    `UPDATE event_cohosts SET permission_level = ?, expires_at = ? WHERE id = ? AND event_id = ?`,
    [parsed.data.permissionLevel, parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, cohost.id, eventId],
  );
  if (cohost.invited_user_id) {
    await getPool().execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'COHOST_ACCESS_UPDATED', 'EVENTS', 'Co-host access updated', ?, ?)`,
      [randomUUID(), cohost.invited_user_id, `Your co-host access for ${event.name} is now ${parsed.data.permissionLevel.replaceAll("_", " ").toLowerCase()}.`, `/dashboard/events/${eventId}`],
    );
  }
  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.cohost_updated", targetType: cohost.invited_user_id ? "user" : "discord_user", targetId: cohost.invited_user_id ?? cohost.invited_discord_id, details: { previousPermissionLevel: cohost.permission_level, permissionLevel: parsed.data.permissionLevel, expiresAt: parsed.data.expiresAt ?? null } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const cohostId = request.nextUrl.searchParams.get("cohostId")?.trim() ?? "";
  if (!cohostId) return NextResponse.json({ error: "Co-host ID is required." }, { status: 400 });

  const { event, allowed } = await requireEventManager(session.userId, eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Event-management permission is required to revoke co-hosts." }, { status: 403 });

  const rows = await query<CohostRow[]>(
    `SELECT id, CAST(invited_user_id AS CHAR) AS invited_user_id, invited_discord_id, permission_level, status
     FROM event_cohosts WHERE id = ? AND event_id = ? LIMIT 1`,
    [cohostId, eventId],
  );
  const cohost = rows[0];
  if (!cohost) return NextResponse.json({ error: "Co-host invitation not found." }, { status: 404 });

  await getPool().execute(
    `UPDATE event_cohosts SET status = 'REVOKED', responded_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND event_id = ?`,
    [cohost.id, eventId],
  );
  if (cohost.invited_user_id) {
    await getPool().execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'COHOST_ACCESS_REVOKED', 'EVENTS', 'Co-host access removed', ?, ?)`,
      [randomUUID(), cohost.invited_user_id, `Your co-host access for ${event.name} was removed.`, `/dashboard/events/${eventId}`],
    );
  }
  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.cohost_revoked", targetType: cohost.invited_user_id ? "user" : "discord_user", targetId: cohost.invited_user_id ?? cohost.invited_discord_id, details: { permissionLevel: cohost.permission_level } });
  return NextResponse.json({ success: true });
}
