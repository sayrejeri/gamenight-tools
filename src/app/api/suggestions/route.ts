import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const createSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(["EVENTS", "BRACKETS", "TEAMS", "PROFILES", "MOBILE", "DISCORD", "TOOLS", "OTHER"]),
  scopeType: z.enum(["PLATFORM", "WORKSPACE", "TEAM"]).default("PLATFORM"),
  scopeId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a clear title and description." }, { status: 400 });

  if (parsed.data.scopeType !== "PLATFORM" && !parsed.data.scopeId) {
    return NextResponse.json({ error: "A server or team is required for that suggestion." }, { status: 400 });
  }

  if (parsed.data.scopeType === "WORKSPACE") {
    const access = await query<RowDataPacket[]>(
      `SELECT w.id FROM workspaces w
       INNER JOIN user_guilds ug ON ug.guild_id = w.discord_guild_id AND ug.user_id = ?
       WHERE w.id = ? AND w.suggestions_enabled = 1 AND w.profile_status = 'APPROVED' LIMIT 1`,
      [session.userId, parsed.data.scopeId],
    );
    if (!access[0]) return NextResponse.json({ error: "You cannot post suggestions to that server." }, { status: 403 });
  }

  if (parsed.data.scopeType === "TEAM") {
    const access = await query<RowDataPacket[]>(
      `SELECT t.id FROM teams t INNER JOIN team_members tm ON tm.team_id = t.id
       WHERE t.id = ? AND tm.user_id = ? AND tm.status = 'ACTIVE'
         AND t.suggestions_enabled = 1 AND t.profile_status = 'APPROVED' LIMIT 1`,
      [parsed.data.scopeId, session.userId],
    );
    if (!access[0]) return NextResponse.json({ error: "You cannot post suggestions to that team." }, { status: 403 });
  }

  const id = randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO suggestions
        (id, author_user_id, scope_type, scope_id, title, description, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, session.userId, parsed.data.scopeType, parsed.data.scopeId ?? null, parsed.data.title, parsed.data.description, parsed.data.category],
    );
    await connection.execute(
      `INSERT INTO suggestion_votes (suggestion_id, user_id, vote_value) VALUES (?, ?, 1)`,
      [id, session.userId],
    );
  });

  return NextResponse.json({ id }, { status: 201 });
}
