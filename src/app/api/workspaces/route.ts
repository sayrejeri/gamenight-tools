import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { isPlatformOwner, readSession } from "@/lib/auth";
import { getPool, query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";

const createWorkspaceSchema = z.object({
  guildId: z.string().regex(/^\d{15,25}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().min(2).max(100).default("America/Detroit"),
  ownerDiscordIds: z.array(z.string().regex(/^\d{15,25}$/)).min(1).max(25),
});

type WorkspaceRow = RowDataPacket & {
  id: string;
  discord_guild_id: string;
  name: string;
  description: string | null;
  timezone: string;
  role: string | null;
};

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const rows = await query<WorkspaceRow[]>(
    `SELECT w.id, w.discord_guild_id, w.name, w.description, w.timezone, wm.role
     FROM workspaces w
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.status = 'ACTIVE'
     INNER JOIN user_guilds ug
       ON ug.user_id = ? AND ug.guild_id = w.discord_guild_id
     ORDER BY w.name ASC`,
    [session.userId, session.userId],
  );

  return NextResponse.json({ workspaces: rows });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformOwner(session.discordId)) {
    return NextResponse.json({ error: "Only a platform owner can create server profiles." }, { status: 403 });
  }

  const parsed = createWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid server profile information.", details: parsed.error.flatten() }, { status: 400 });
  }

  const workspaceId = randomUUID();
  const ownerIds = [...new Set(parsed.data.ownerDiscordIds)];

  try {
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO workspaces
          (id, discord_guild_id, name, description, timezone, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workspaceId,
          parsed.data.guildId,
          parsed.data.name,
          parsed.data.description ?? null,
          parsed.data.timezone,
          session.userId,
        ],
      );

      for (const discordId of ownerIds) {
        await connection.execute(
          `INSERT INTO workspace_owner_claims (workspace_id, discord_id, created_by)
           VALUES (?, ?, ?)`,
          [workspaceId, discordId, session.userId],
        );
      }

      for (const discordId of ownerIds) {
        await connection.execute(
          `INSERT INTO workspace_members (workspace_id, user_id, role, status, approved_by)
           SELECT ?, id, 'OWNER', 'ACTIVE', ? FROM users WHERE discord_id = ?
           ON DUPLICATE KEY UPDATE role = 'OWNER', status = 'ACTIVE'`,
          [workspaceId, session.userId, discordId],
        );
      }
    });

    await writeAuditLog({
      actorUserId: session.userId,
      workspaceId,
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspaceId,
      details: { guildId: parsed.data.guildId, ownerDiscordIds: ownerIds },
    });

    return NextResponse.json({ workspaceId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "The server profile could not be created. The Discord server may already exist." }, { status: 409 });
  }
}
