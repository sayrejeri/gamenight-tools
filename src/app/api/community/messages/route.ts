import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import {
  canSendToChannel,
  communityScopePath,
  getActiveCommunityTimeout,
  getCommunityChannelContext,
  getCommunityScopeAccess,
} from "@/lib/community-chat";

const sendSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  replyToMessageId: z.string().uuid().nullable().optional(),
});

type MessageRow = RowDataPacket & {
  id: string;
  channel_id: string;
  author_user_id: string;
  body: string;
  is_announcement: number;
  is_pinned: number;
  edited_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  site_username: string | null;
  discord_username: string;
  display_name: string;
  avatar_url: string | null;
  reply_to_message_id: string | null;
  reply_author_name: string | null;
  reply_body: string | null;
  reply_deleted_at: Date | null;
};

type ReactionRow = RowDataPacket & { message_id: string; user_id: string; emoji: string };
type MentionUserRow = RowDataPacket & { id: string; site_username: string | null; username: string };

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const channelId = request.nextUrl.searchParams.get("channelId")?.trim() ?? "";
  if (!channelId) return NextResponse.json({ error: "A channel is required." }, { status: 400 });

  const context = await getCommunityChannelContext(session.userId, channelId);
  if (!context) return NextResponse.json({ error: "You do not have access to this channel." }, { status: 403 });

  const rows = await query<MessageRow[]>(
    `SELECT CAST(m.id AS CHAR) AS id, m.channel_id, CAST(m.author_user_id AS CHAR) AS author_user_id,
            m.body, m.is_announcement, m.is_pinned, m.edited_at, m.deleted_at, m.created_at,
            u.site_username, u.username AS discord_username, COALESCE(u.global_name, u.username) AS display_name,
            CASE WHEN u.avatar_hash IS NULL THEN NULL ELSE CONCAT('https://cdn.discordapp.com/avatars/', u.discord_id, '/', u.avatar_hash, '.png?size=128') END AS avatar_url,
            m.reply_to_message_id, COALESCE(ru.global_name, ru.username) AS reply_author_name,
            rm.body AS reply_body, rm.deleted_at AS reply_deleted_at
     FROM community_messages m
     INNER JOIN users u ON u.id = m.author_user_id
     LEFT JOIN community_messages rm ON rm.id = m.reply_to_message_id
     LEFT JOIN users ru ON ru.id = rm.author_user_id
     WHERE m.channel_id = ?
     ORDER BY m.created_at DESC
     LIMIT 100`,
    [channelId],
  );
  rows.reverse();

  const messageIds = rows.map((row) => row.id);
  let reactions: ReactionRow[] = [];
  if (messageIds.length) {
    const placeholders = messageIds.map(() => "?").join(",");
    reactions = await query<ReactionRow[]>(
      `SELECT message_id, CAST(user_id AS CHAR) AS user_id, emoji
       FROM community_message_reactions WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
      messageIds,
    );
  }

  const reactionMap = new Map<string, Map<string, { count: number; reacted: boolean }>>();
  for (const reaction of reactions) {
    const byEmoji = reactionMap.get(reaction.message_id) ?? new Map<string, { count: number; reacted: boolean }>();
    const current = byEmoji.get(reaction.emoji) ?? { count: 0, reacted: false };
    current.count += 1;
    if (reaction.user_id === session.userId) current.reacted = true;
    byEmoji.set(reaction.emoji, current);
    reactionMap.set(reaction.message_id, byEmoji);
  }

  const timeout = await getActiveCommunityTimeout(session.userId, context.channel.scope_type, context.channel.scope_id);
  return NextResponse.json({
    channel: {
      id: context.channel.id,
      name: context.channel.name,
      channelType: context.channel.channel_type,
      topic: context.channel.topic,
      slowmodeSeconds: Number(context.channel.slowmode_seconds),
    },
    permissions: {
      canSend: canSendToChannel(context.access, context.channel.channel_type) && !timeout,
      canManageMessages: context.access.canManageMessages,
      canTimeoutMembers: context.access.canTimeoutMembers,
      canPostAnnouncements: context.access.canPostAnnouncements,
    },
    timeout: timeout ? { expiresAt: new Date(timeout.expires_at).toISOString(), reason: timeout.reason } : null,
    messages: rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      authorUserId: row.author_user_id,
      author: {
        displayName: row.display_name,
        siteUsername: row.site_username,
        discordUsername: row.discord_username,
        avatarUrl: row.avatar_url,
      },
      body: row.deleted_at ? null : row.body,
      isAnnouncement: Boolean(row.is_announcement),
      isPinned: Boolean(row.is_pinned),
      editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
      deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      reply: row.reply_to_message_id ? {
        id: row.reply_to_message_id,
        authorName: row.reply_author_name,
        body: row.reply_deleted_at ? null : row.reply_body,
      } : null,
      reactions: Array.from(reactionMap.get(row.id)?.entries() ?? []).map(([emoji, value]) => ({ emoji, ...value })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a message up to 4,000 characters." }, { status: 400 });

  const context = await getCommunityChannelContext(session.userId, parsed.data.channelId);
  if (!context || !canSendToChannel(context.access, context.channel.channel_type)) {
    return NextResponse.json({ error: "You cannot send messages in this channel." }, { status: 403 });
  }

  const timeout = await getActiveCommunityTimeout(session.userId, context.channel.scope_type, context.channel.scope_id);
  if (timeout) {
    return NextResponse.json({
      error: `You are timed out from this chat until ${new Date(timeout.expires_at).toLocaleString()}.`,
      timeoutExpiresAt: new Date(timeout.expires_at).toISOString(),
    }, { status: 403 });
  }

  if (context.channel.slowmode_seconds > 0 && !context.access.canManageMessages) {
    const recent = await query<(RowDataPacket & { seconds_ago: number })[]>(
      `SELECT TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP(3)) AS seconds_ago
       FROM community_messages WHERE channel_id = ? AND author_user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [context.channel.id, session.userId],
    );
    const secondsAgo = Number(recent[0]?.seconds_ago ?? context.channel.slowmode_seconds);
    if (secondsAgo < context.channel.slowmode_seconds) {
      return NextResponse.json({ error: `Slow mode is enabled. Try again in ${context.channel.slowmode_seconds - secondsAgo} seconds.` }, { status: 429 });
    }
  }

  let replyAuthorUserId: string | null = null;
  if (parsed.data.replyToMessageId) {
    const replyRows = await query<(RowDataPacket & { author_user_id: string })[]>(
      `SELECT CAST(author_user_id AS CHAR) AS author_user_id FROM community_messages
       WHERE id = ? AND channel_id = ? AND deleted_at IS NULL LIMIT 1`,
      [parsed.data.replyToMessageId, context.channel.id],
    );
    if (!replyRows[0]) return NextResponse.json({ error: "The message you are replying to is unavailable." }, { status: 409 });
    replyAuthorUserId = replyRows[0].author_user_id;
  }

  const messageId = randomUUID();
  await getPool().execute(
    `INSERT INTO community_messages
      (id, channel_id, author_user_id, reply_to_message_id, body, is_announcement)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      messageId,
      context.channel.id,
      session.userId,
      parsed.data.replyToMessageId ?? null,
      parsed.data.body,
      context.channel.channel_type === "ANNOUNCEMENT" ? 1 : 0,
    ],
  );

  const actionUrl = `${communityScopePath(context.channel.scope_type, context.channel.scope_id)}?channel=${encodeURIComponent(context.channel.id)}`;
  const notified = new Set<string>();
  if (replyAuthorUserId && replyAuthorUserId !== session.userId) {
    notified.add(replyAuthorUserId);
    await getPool().execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'CHAT_REPLY', 'CHAT', 'New reply', ?, ?)`,
      [randomUUID(), replyAuthorUserId, `${session.globalName ?? session.username} replied to you in ${context.access.name} #${context.channel.name}.`, actionUrl],
    );
  }

  const mentionNames = Array.from(parsed.data.body.matchAll(/@([A-Za-z0-9_.-]{2,40})/g))
    .map((match) => match[1].toLowerCase())
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 10);
  if (mentionNames.length) {
    const placeholders = mentionNames.map(() => "?").join(",");
    const mentionRows = await query<MentionUserRow[]>(
      `SELECT CAST(id AS CHAR) AS id, site_username, username FROM users
       WHERE account_status = 'ACTIVE'
         AND (LOWER(site_username) IN (${placeholders}) OR LOWER(username) IN (${placeholders}))`,
      [...mentionNames, ...mentionNames],
    );
    for (const mentioned of mentionRows) {
      if (mentioned.id === session.userId || notified.has(mentioned.id)) continue;
      const mentionedAccess = await getCommunityScopeAccess(mentioned.id, context.channel.scope_type, context.channel.scope_id);
      if (!mentionedAccess?.canRead) continue;
      notified.add(mentioned.id);
      await getPool().execute(
        `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
         VALUES (?, ?, 'CHAT_MENTION', 'CHAT', 'You were mentioned', ?, ?)`,
        [randomUUID(), mentioned.id, `${session.globalName ?? session.username} mentioned you in ${context.access.name} #${context.channel.name}.`, actionUrl],
      );
    }
  }

  return NextResponse.json({ success: true, id: messageId }, { status: 201 });
}
