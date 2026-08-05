import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const userId = String((await request.json().catch(() => ({})) as { userId?: string }).userId ?? "");
  if (!userId || userId === session.userId) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  await getPool().execute(
    `INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE created_at = created_at`,
    [session.userId, userId],
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "User is required." }, { status: 400 });
  await getPool().execute(`DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?`, [session.userId, userId]);
  return NextResponse.json({ success: true });
}
