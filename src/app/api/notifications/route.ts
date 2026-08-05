import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: string; all?: boolean };
  if (body.all) {
    await getPool().execute(`UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3)) WHERE user_id = ? AND is_read = 0`, [session.userId]);
  } else if (body.id) {
    await getPool().execute(`UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3)) WHERE id = ? AND user_id = ?`, [body.id, session.userId]);
  } else {
    return NextResponse.json({ error: "Notification ID is required." }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
