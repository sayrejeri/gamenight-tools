import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getCommunityChannelContext, makeChannelSlug } from "@/lib/community-chat";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  channelType: z.enum(["CHAT", "ANNOUNCEMENT", "STAFF"]),
  topic: z.string().trim().max(240).optional().default(""),
  slowmodeSeconds: z.number().int().min(0).max(300).optional().default(0),
  position: z.number().int().min(0).max(10000).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ channelId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { channelId } = await context.params;
  const channelContext = await getCommunityChannelContext(session.userId, channelId);
  if (!channelContext?.access.canManageChannels) {
    return NextResponse.json({ error: "Channel management permission is required." }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel settings." }, { status: 400 });
  const { name, channelType, topic, slowmodeSeconds, position } = parsed.data;
  const { channel, access } = channelContext;

  let slug = makeChannelSlug(name);
  const collision = await query<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM community_channels
     WHERE scope_type = ? AND scope_id = ? AND slug = ? AND id <> ? LIMIT 1`,
    [channel.scope_type, channel.scope_id, slug, channelId],
  );
  if (collision[0]) slug = `${slug}-${channelId.slice(0, 6)}`.slice(0, 80);

  await getPool().execute(
    `UPDATE community_channels
     SET name = ?, slug = ?, channel_type = ?, topic = ?, slowmode_seconds = ?,
         position = COALESCE(?, position), updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [name, slug, channelType, topic || null, slowmodeSeconds, position ?? null, channelId],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: channel.scope_type === "WORKSPACE" ? channel.scope_id : null,
    action: "community.channel.updated",
    targetType: "channel",
    targetId: channelId,
    details: { name, channelType, slowmodeSeconds, scopeType: access.scopeType, scopeId: access.scopeId },
  });

  return NextResponse.json({ success: true, slug });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ channelId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { channelId } = await context.params;
  const channelContext = await getCommunityChannelContext(session.userId, channelId);
  if (!channelContext?.access.canManageChannels) {
    return NextResponse.json({ error: "Channel management permission is required." }, { status: 403 });
  }
  const { channel } = channelContext;

  const counts = await query<(RowDataPacket & { active_count: number })[]>(
    `SELECT COUNT(*) AS active_count FROM community_channels
     WHERE scope_type = ? AND scope_id = ? AND is_archived = 0`,
    [channel.scope_type, channel.scope_id],
  );
  if (Number(counts[0]?.active_count ?? 0) <= 1) {
    return NextResponse.json({ error: "A community must keep at least one active channel." }, { status: 409 });
  }

  await getPool().execute(
    `UPDATE community_channels SET is_archived = 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [channelId],
  );
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: channel.scope_type === "WORKSPACE" ? channel.scope_id : null,
    action: "community.channel.archived",
    targetType: "channel",
    targetId: channelId,
    details: { name: channel.name, scopeType: channel.scope_type, scopeId: channel.scope_id },
  });
  return NextResponse.json({ success: true });
}
