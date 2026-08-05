import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

const reportSchema = z.object({
  targetType: z.enum(["USER", "WORKSPACE", "TEAM", "EVENT", "SUGGESTION", "MESSAGE"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "INAPPROPRIATE_CONTENT", "CHEATING", "OTHER"]),
  details: z.string().trim().max(2000).optional().default(""),
});

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  await getPool().execute(
    `INSERT INTO reports (id, reporter_user_id, target_type, target_id, reason, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), session.userId, parsed.data.targetType, parsed.data.targetId, parsed.data.reason, parsed.data.details || null],
  );
  return NextResponse.json({ success: true }, { status: 201 });
}
