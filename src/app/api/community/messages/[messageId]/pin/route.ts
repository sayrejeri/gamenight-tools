import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getCommunityChannelContext } from "@/lib/community-chat";

type MessageRow = RowDataPacket & { channel_id: string; is_pinned: number; deleted_at: Date | null };

export async function POST(_request: Request, context: { params: Promise<{ messageId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { messageId } = await context.params;
  const rows = await query<MessageRow[]>(
    `SELECT channel_id, is_pinned, deleted_at FROM community_messages WHERE id = ? LIMIT 1`,
    [messageId],
  );
  const message = rows[0];
  if (!message || message.deleted_at) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  const channelContext = await getCommunityChannelContext(session.userId, message.channel_id);
  if (!channelContext?.access.canManageMessages) {
    return NextResponse.json({ error: "Message moderation permission is required." }, { status: 403 });
  }

  const pinned = !Boolean(message.is_pinned);
  await getPool().execute(`UPDATE community_messages SET is_pinned = ? WHERE id = ?`, [pinned ? 1 : 0, messageId]);
  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: channelContext.channel.scope_type === "WORKSPACE" ? channelContext.channel.scope_id : null,
    action: pinned ? "community.message.pinned" : "community.message.unpinned",
    targetType: "message",
    targetId: messageId,
    details: { channelId: channelContext.channel.id, scopeType: channelContext.channel.scope_type, scopeId: channelContext.channel.scope_id },
  });
  return NextResponse.json({ success: true, pinned });
}
