import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getCommunityChannelContext } from "@/lib/community-chat";

const editSchema = z.object({ body: z.string().trim().min(1).max(4000) });
const deleteSchema = z.object({ reason: z.string().trim().max(500).optional().default("") });

type MessageAccessRow = RowDataPacket & {
  id: string;
  channel_id: string;
  author_user_id: string;
  deleted_at: Date | null;
};

async function getMessageAccess(userId: string, messageId: string) {
  const rows = await query<MessageAccessRow[]>(
    `SELECT id, channel_id, CAST(author_user_id AS CHAR) AS author_user_id, deleted_at
     FROM community_messages WHERE id = ? LIMIT 1`,
    [messageId],
  );
  const message = rows[0];
  if (!message) return null;
  const context = await getCommunityChannelContext(userId, message.channel_id);
  if (!context) return null;
  return { message, ...context };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { messageId } = await context.params;
  const access = await getMessageAccess(session.userId, messageId);
  if (!access) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (access.message.deleted_at) return NextResponse.json({ error: "Deleted messages cannot be edited." }, { status: 409 });
  if (access.message.author_user_id !== session.userId) {
    return NextResponse.json({ error: "Only the message author can edit a message. Moderators can remove it instead." }, { status: 403 });
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a message up to 4,000 characters." }, { status: 400 });
  await getPool().execute(
    `UPDATE community_messages SET body = ?, edited_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [parsed.data.body, messageId],
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { messageId } = await context.params;
  const access = await getMessageAccess(session.userId, messageId);
  if (!access) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (access.message.deleted_at) return NextResponse.json({ success: true });

  const isAuthor = access.message.author_user_id === session.userId;
  if (!isAuthor && !access.access.canManageMessages) {
    return NextResponse.json({ error: "Message moderation permission is required." }, { status: 403 });
  }
  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  const reason = parsed.success ? parsed.data.reason : "";

  await getPool().execute(
    `UPDATE community_messages
     SET deleted_at = CURRENT_TIMESTAMP(3), deleted_by = ?, delete_reason = ?, is_pinned = 0, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [session.userId, reason || (isAuthor ? "Deleted by author" : "Removed by moderator"), messageId],
  );

  if (!isAuthor) {
    await writeAuditLog({
      actorUserId: session.userId,
      workspaceId: access.channel.scope_type === "WORKSPACE" ? access.channel.scope_id : null,
      action: "community.message.removed",
      targetType: "message",
      targetId: messageId,
      severity: "MODERATION",
      details: { scopeType: access.channel.scope_type, scopeId: access.channel.scope_id, channelId: access.channel.id, reason: reason || null },
    });
  }

  return NextResponse.json({ success: true });
}
