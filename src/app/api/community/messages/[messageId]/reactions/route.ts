import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { getCommunityChannelContext } from "@/lib/community-chat";

const reactionSchema = z.object({ emoji: z.string().trim().min(1).max(32) });

type MessageRow = RowDataPacket & { channel_id: string; deleted_at: Date | null };

export async function POST(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = reactionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid reaction." }, { status: 400 });
  const { messageId } = await context.params;

  const rows = await query<MessageRow[]>(`SELECT channel_id, deleted_at FROM community_messages WHERE id = ? LIMIT 1`, [messageId]);
  const message = rows[0];
  if (!message || message.deleted_at) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  const channelContext = await getCommunityChannelContext(session.userId, message.channel_id);
  if (!channelContext?.access.canRead) return NextResponse.json({ error: "You do not have access to this message." }, { status: 403 });

  const existing = await query<(RowDataPacket & { emoji: string })[]>(
    `SELECT emoji FROM community_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1`,
    [messageId, session.userId, parsed.data.emoji],
  );
  if (existing[0]) {
    await getPool().execute(
      `DELETE FROM community_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
      [messageId, session.userId, parsed.data.emoji],
    );
    return NextResponse.json({ success: true, reacted: false });
  }

  await getPool().execute(
    `INSERT INTO community_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`,
    [messageId, session.userId, parsed.data.emoji],
  );
  return NextResponse.json({ success: true, reacted: true });
}
