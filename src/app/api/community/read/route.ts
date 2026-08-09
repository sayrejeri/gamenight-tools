import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getCommunityChannelContext } from "@/lib/community-chat";

const readSchema = z.object({ channelId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  const context = await getCommunityChannelContext(session.userId, parsed.data.channelId);
  if (!context) return NextResponse.json({ error: "Channel access is required." }, { status: 403 });

  await getPool().execute(
    `INSERT INTO community_channel_reads (channel_id, user_id, last_read_at)
     VALUES (?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE last_read_at = CURRENT_TIMESTAMP(3)`,
    [parsed.data.channelId, session.userId],
  );
  return NextResponse.json({ success: true });
}
