import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

const responseSchema = z.object({ action: z.enum(["ACCEPT", "DECLINE"]) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = responseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation response." }, { status: 400 });
  const { teamId } = await context.params;
  const [result] = await getPool().execute(
    `UPDATE team_members
     SET status = ?, joined_at = IF(? = 'ACTIVE', CURRENT_TIMESTAMP(3), NULL), updated_at = CURRENT_TIMESTAMP(3)
     WHERE team_id = ? AND user_id = ? AND status = 'INVITED'`,
    [parsed.data.action === "ACCEPT" ? "ACTIVE" : "DECLINED", parsed.data.action === "ACCEPT" ? "ACTIVE" : "DECLINED", teamId, session.userId],
  );
  const affected = "affectedRows" in result ? Number(result.affectedRows) : 0;
  if (!affected) return NextResponse.json({ error: "That invitation is no longer available." }, { status: 409 });
  return NextResponse.json({ success: true, status: parsed.data.action === "ACCEPT" ? "ACTIVE" : "DECLINED" });
}
