import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const applySchema = z.object({ desiredRole: z.enum(["PLAYER", "SUBSTITUTE", "COACH", "MANAGER"]), message: z.string().trim().max(1000).optional().default("") });

type TeamRow = RowDataPacket & { name: string; slug: string; recruiting_status: string };

export async function POST(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = applySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid team application." }, { status: 400 });
  const { teamId } = await context.params;
  const teams = await query<TeamRow[]>(
    `SELECT name, slug, recruiting_status FROM teams WHERE id = ? AND profile_status = 'APPROVED' LIMIT 1`,
    [teamId],
  );
  const team = teams[0];
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (team.recruiting_status !== "OPEN") return NextResponse.json({ error: "This team is not accepting public applications." }, { status: 409 });

  const [memberships, applications] = await Promise.all([
    query<RowDataPacket[]>(
      `SELECT team_id FROM team_members WHERE team_id = ? AND user_id = ? AND status IN ('ACTIVE', 'INVITED') LIMIT 1`,
      [teamId, session.userId],
    ),
    query<RowDataPacket[]>(
      `SELECT id FROM team_applications WHERE team_id = ? AND applicant_user_id = ? AND status = 'PENDING' LIMIT 1`,
      [teamId, session.userId],
    ),
  ]);
  if (memberships[0]) return NextResponse.json({ error: "You are already a member or have a pending invitation." }, { status: 409 });
  if (applications[0]) return NextResponse.json({ error: "You already have a pending application for this team." }, { status: 409 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO team_applications (id, team_id, applicant_user_id, desired_role, message)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), teamId, session.userId, parsed.data.desiredRole, parsed.data.message || null],
    );
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       SELECT UUID(), tm.user_id, 'TEAM_APPLICATION', 'TEAMS', 'New team application', ?, ?
       FROM team_members tm WHERE tm.team_id = ? AND tm.status = 'ACTIVE' AND tm.role IN ('OWNER', 'MANAGER')`,
      [`A player applied to join ${team.name}.`, `/teams/${team.slug}`, teamId],
    );
  });
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE team_applications SET status = 'WITHDRAWN', updated_at = CURRENT_TIMESTAMP(3)
       WHERE team_id = ? AND applicant_user_id = ? AND status = 'PENDING'`,
      [teamId, session.userId],
    );
  });
  return NextResponse.json({ success: true });
}
