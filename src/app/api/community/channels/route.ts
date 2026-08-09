import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  canViewChannel,
  ensureDefaultCommunityChannels,
  getCommunityScopeAccess,
  makeChannelSlug,
  type CommunityChannelType,
  type CommunityScopeType,
} from "@/lib/community-chat";

const createSchema = z.object({
  scopeType: z.enum(["WORKSPACE", "TEAM"]),
  scopeId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  channelType: z.enum(["CHAT", "ANNOUNCEMENT", "STAFF"]).default("CHAT"),
  topic: z.string().trim().max(240).optional().default(""),
  slowmodeSeconds: z.number().int().min(0).max(300).optional().default(0),
});

type ChannelRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  channel_type: CommunityChannelType;
  topic: string | null;
  position: number;
  slowmode_seconds: number;
  unread_count: number;
  pinned_count: number;
};

function parseScopeType(value: string | null): CommunityScopeType | null {
  return value === "WORKSPACE" || value === "TEAM" ? value : null;
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const scopeType = parseScopeType(request.nextUrl.searchParams.get("scopeType"));
  const scopeId = request.nextUrl.searchParams.get("scopeId")?.trim() ?? "";
  if (!scopeType || !scopeId) return NextResponse.json({ error: "A valid community scope is required." }, { status: 400 });

  const access = await getCommunityScopeAccess(session.userId, scopeType, scopeId);
  if (!access || (!access.canRead && !access.canManageChannels)) {
    return NextResponse.json({ error: "Community chat access is required." }, { status: 403 });
  }

  await ensureDefaultCommunityChannels(scopeType, scopeId);
  const rows = await query<ChannelRow[]>(
    `SELECT c.id, c.name, c.slug, c.channel_type, c.topic, c.position, c.slowmode_seconds,
            (SELECT COUNT(*) FROM community_messages m
             WHERE m.channel_id = c.id AND m.deleted_at IS NULL AND m.author_user_id <> ?
               AND m.created_at > COALESCE(
                 (SELECT r.last_read_at FROM community_channel_reads r WHERE r.channel_id = c.id AND r.user_id = ?),
                 '1970-01-01 00:00:00'
               )) AS unread_count,
            (SELECT COUNT(*) FROM community_messages p WHERE p.channel_id = c.id AND p.is_pinned = 1 AND p.deleted_at IS NULL) AS pinned_count
     FROM community_channels c
     WHERE c.scope_type = ? AND c.scope_id = ? AND c.is_archived = 0
     ORDER BY c.position ASC, c.created_at ASC`,
    [session.userId, session.userId, scopeType, scopeId],
  );

  const channels = rows
    .filter((channel) => canViewChannel(access, channel.channel_type))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      slug: channel.slug,
      channelType: channel.channel_type,
      topic: channel.topic,
      position: Number(channel.position),
      slowmodeSeconds: Number(channel.slowmode_seconds),
      unreadCount: Number(channel.unread_count),
      pinnedCount: Number(channel.pinned_count),
    }));

  return NextResponse.json({
    scope: {
      type: access.scopeType,
      id: access.scopeId,
      name: access.name,
      chatEnabled: access.chatEnabled,
    },
    permissions: {
      canSend: access.canSend,
      canManageChannels: access.canManageChannels,
      canManageMessages: access.canManageMessages,
      canTimeoutMembers: access.canTimeoutMembers,
      canViewStaffChannels: access.canViewStaffChannels,
      canPostAnnouncements: access.canPostAnnouncements,
    },
    channels,
  });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel settings." }, { status: 400 });

  const { scopeType, scopeId, name, channelType, topic, slowmodeSeconds } = parsed.data;
  const access = await getCommunityScopeAccess(session.userId, scopeType, scopeId);
  if (!access?.canManageChannels) return NextResponse.json({ error: "Channel management permission is required." }, { status: 403 });

  const baseSlug = makeChannelSlug(name);
  let slug = baseSlug;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const existing = await query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM community_channels WHERE scope_type = ? AND scope_id = ? AND slug = ? LIMIT 1`,
      [scopeType, scopeId, slug],
    );
    if (!existing[0]) break;
    slug = `${baseSlug}-${attempt + 1}`.slice(0, 80);
  }

  const id = randomUUID();
  const positions = await query<(RowDataPacket & { next_position: number })[]>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM community_channels WHERE scope_type = ? AND scope_id = ?`,
    [scopeType, scopeId],
  );
  await getPool().execute(
    `INSERT INTO community_channels
      (id, scope_type, scope_id, name, slug, channel_type, topic, position, slowmode_seconds, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, scopeType, scopeId, name, slug, channelType, topic || null, Number(positions[0]?.next_position ?? 0), slowmodeSeconds, session.userId],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: scopeType === "WORKSPACE" ? scopeId : null,
    action: "community.channel.created",
    targetType: "channel",
    targetId: id,
    details: { scopeType, scopeId, name, channelType, slowmodeSeconds },
  });

  return NextResponse.json({ success: true, id, slug }, { status: 201 });
}
