import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getPlatformRole } from "@/lib/platform-access";

const commentSchema = z.object({ body: z.string().trim().min(2).max(2000) });

export async function POST(request: NextRequest, context: { params: Promise<{ suggestionId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comments must be 2–2,000 characters." }, { status: 400 });
  const { suggestionId } = await context.params;
  const platformRole = await getPlatformRole(session.userId);

  await getPool().execute(
    `INSERT INTO suggestion_comments (id, suggestion_id, author_user_id, body, is_staff_reply)
     SELECT ?, s.id, ?, ?, ? FROM suggestions s WHERE s.id = ? AND s.is_locked = 0`,
    [randomUUID(), session.userId, parsed.data.body, platformRole ? 1 : 0, suggestionId],
  );
  return NextResponse.json({ success: true }, { status: 201 });
}
