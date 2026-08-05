import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const inviteSchema = z.object({
  identifier: z.string().trim().min(2).max(100),
  role: z.enum(["MANAGER", "CAPTAIN", "PLAYER", "SUBSTITUTE", "COACH"]),
});

export async function POST(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  const access = await query<RowDataPacket[]>(
    `SELECT team_id FROM team_members
     WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('OWNER', 'MANAGER') LIMIT 1`,
    [teamId, session.userId],
  );
  if (!access[0]) return NextResponse.json({ error: "Team owner or manager access is required." }, { status: 403 });
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid site user and team role." }, { status: 400 });

  const users = await query<(RowDataPacket & { id: string; display_name: string })[]>(
    `SELECT id, COALESCE(site_username, global_name, username) AS display_name
     FROM users WHERE account_status = 'ACTIVE'
       AND (LOWER(site_username) = LOWER(?) OR LOWER(username) = LOWER(?) OR discord_id = ?)
     LIMIT 1`,
    [parsed.data.identifier, parsed.data.identifier, parsed.data.identifier],
  );
  const target = users[0];
  if (!target) return NextResponse.json({ error: "That user has not signed into Game Night Tools yet." }, { status: 404 });
  if (target.id === session.userId) return NextResponse.json({ error: "You are already on this team." }, { status: 409 });

  const teams = await query<(RowDataPacket & { name: string; slug: string })[]>(
    `SELECT name, slug FROM teams WHERE id = ? AND profile_status = 'APPROVED' LIMIT 1`,
    [teamId],
  );
  const team = teams[0];
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const memberships = await query<(RowDataPacket & { status: string })[]>(
    `SELECT status FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1`,
    [teamId, target.id],
  );
  if (memberships[0]?.status === "ACTIVE") return NextResponse.json({ error: "That user is already an active team member." }, { status: 409 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO team_members (team_id, user_id, role, status, invited_by)
       VALUES (?, ?, ?, 'INVITED', ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'INVITED', invited_by = VALUES(invited_by), updated_at = CURRENT_TIMESTAMP(3)`,
      [teamId, target.id, parsed.data.role, session.userId],
    );
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'TEAM_INVITATION', 'TEAMS', 'Team invitation', ?, '/dashboard/teams')`,
      [randomUUID(), target.id, `${team.name} invited you to join as ${parsed.data.role.toLowerCase()}.`],
    );
  });

  return NextResponse.json({ success: true, invitedUser: target.display_name }, { status: 201 });
}
