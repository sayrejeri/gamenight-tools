import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

const voteSchema = z.object({ vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });

export async function PUT(request: NextRequest, context: { params: Promise<{ suggestionId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  const { suggestionId } = await context.params;

  if (parsed.data.vote === 0) {
    await getPool().execute(`DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?`, [suggestionId, session.userId]);
  } else {
    await getPool().execute(
      `INSERT INTO suggestion_votes (suggestion_id, user_id, vote_value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE vote_value = VALUES(vote_value), updated_at = CURRENT_TIMESTAMP(3)`,
      [suggestionId, session.userId, parsed.data.vote],
    );
  }

  return NextResponse.json({ success: true });
}
