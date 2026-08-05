import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const updateSchema = z.object({
  description: z.string().trim().max(5000).optional().default(""),
  logoUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  bannerUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  mainPlatform: z.string().trim().max(80).optional().default(""),
  mainGame: z.string().trim().max(191).optional().default(""),
  region: z.string().trim().max(80).optional().default(""),
  recruitingStatus: z.enum(["OPEN", "INVITE_ONLY", "CLOSED"]),
  chatEnabled: z.boolean().default(false),
  suggestionsEnabled: z.boolean().default(true),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  const access = await query<RowDataPacket[]>(
    `SELECT team_id FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('OWNER', 'MANAGER') LIMIT 1`,
    [teamId, session.userId],
  );
  if (!access[0]) return NextResponse.json({ error: "Team owner or manager access is required." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the team profile fields." }, { status: 400 });
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE teams SET description = ?, logo_url = ?, banner_url = ?, main_platform = ?,
         main_game = ?, region = ?, recruiting_status = ?, chat_enabled = ?, suggestions_enabled = ?,
         updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [parsed.data.description || null, parsed.data.logoUrl || null, parsed.data.bannerUrl || null,
        parsed.data.mainPlatform || null, parsed.data.mainGame || null, parsed.data.region || null,
        parsed.data.recruitingStatus, parsed.data.chatEnabled ? 1 : 0, parsed.data.suggestionsEnabled ? 1 : 0, teamId],
    );
  });
  return NextResponse.json({ success: true });
}
