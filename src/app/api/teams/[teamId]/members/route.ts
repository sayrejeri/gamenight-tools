import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const rosterRole = z.enum(["MANAGER", "CAPTAIN", "PLAYER", "SUBSTITUTE", "COACH"]);
const inviteSchema = z.object({ identifier: z.string().trim().min(2).max(100), role: rosterRole });
const updateSchema = z.object({ userId: z.string().min(1), role: rosterRole });

type AccessRow = RowDataPacket & { role: "OWNER" | "MANAGER" };
type TargetMembershipRow = RowDataPacket & { role: string; status: string };

async function managerAccess(userId: string, teamId: string): Promise<AccessRow | null> {
  const rows = await query<AccessRow[]>(
    `SELECT role FROM team_members
     WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('OWNER', 'MANAGER') LIMIT 1`,
    [teamId, userId],
  );
  return rows[0] ?? null;
}

function canChangeTarget(actorRole: string, targetRole: string, nextRole?: string): boolean {
  if (targetRole === "OWNER") return false;
  if (actorRole !== "OWNER" && (targetRole === "MANAGER" || nextRole === "MANAGER")) return false;
  return true;
}

export async function POST(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  const access = await managerAccess(session.userId, teamId);
  if (!access) return NextResponse.json({ error: "Team owner or manager access is required." }, { status: 403 });
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid site user and team role." }, { status: 400 });
  if (parsed.data.role === "MANAGER" && access.role !== "OWNER") {
    return NextResponse.json({ error: "Only the team owner can invite another manager." }, { status: 403 });
  }

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

  const memberships = await query<TargetMembershipRow[]>(
    `SELECT role, status FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1`,
    [teamId, target.id],
  );
  if (memberships[0]?.status === "ACTIVE") return NextResponse.json({ error: "That user is already an active team member." }, { status: 409 });
  if (memberships[0]?.role === "OWNER") return NextResponse.json({ error: "The team owner cannot be reinvited." }, { status: 409 });

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

export async function PATCH(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  const access = await managerAccess(session.userId, teamId);
  if (!access) return NextResponse.json({ error: "Team owner or manager access is required." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid roster update." }, { status: 400 });
  const targets = await query<TargetMembershipRow[]>(
    `SELECT role, status FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1`,
    [teamId, parsed.data.userId],
  );
  const target = targets[0];
  if (!target || target.status !== "ACTIVE") return NextResponse.json({ error: "Active roster member not found." }, { status: 404 });
  if (!canChangeTarget(access.role, target.role, parsed.data.role)) {
    return NextResponse.json({ error: "You cannot change that member's role." }, { status: 403 });
  }
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE team_members SET role = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE'`,
      [parsed.data.role, teamId, parsed.data.userId],
    );
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  const access = await managerAccess(session.userId, teamId);
  if (!access) return NextResponse.json({ error: "Team owner or manager access is required." }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Roster member is required." }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: "Use the leave-team flow for your own membership." }, { status: 409 });
  const targets = await query<TargetMembershipRow[]>(
    `SELECT role, status FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1`,
    [teamId, userId],
  );
  const target = targets[0];
  if (!target) return NextResponse.json({ error: "Roster member not found." }, { status: 404 });
  if (!canChangeTarget(access.role, target.role)) {
    return NextResponse.json({ error: "You cannot remove that member." }, { status: 403 });
  }
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE team_members SET status = 'REMOVED', updated_at = CURRENT_TIMESTAMP(3)
       WHERE team_id = ? AND user_id = ?`,
      [teamId, userId],
    );
  });
  return NextResponse.json({ success: true });
}
