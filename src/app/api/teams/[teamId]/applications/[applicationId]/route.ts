import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const reviewSchema = z.object({ decision: z.enum(["ACCEPTED", "DENIED"]), role: z.enum(["MANAGER", "CAPTAIN", "PLAYER", "SUBSTITUTE", "COACH"]).optional() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ teamId: string; applicationId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid application decision." }, { status: 400 });
  const { teamId, applicationId } = await context.params;
  const access = await query<RowDataPacket[]>(
    `SELECT team_id FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('OWNER', 'MANAGER') LIMIT 1`,
    [teamId, session.userId],
  );
  if (!access[0]) return NextResponse.json({ error: "Team owner or manager access is required." }, { status: 403 });
  const applications = await query<(RowDataPacket & { applicant_user_id: string; desired_role: string; team_name: string; slug: string })[]>(
    `SELECT ta.applicant_user_id, ta.desired_role, t.name AS team_name, t.slug
     FROM team_applications ta INNER JOIN teams t ON t.id = ta.team_id
     WHERE ta.id = ? AND ta.team_id = ? AND ta.status = 'PENDING' LIMIT 1`,
    [applicationId, teamId],
  );
  const application = applications[0];
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE team_applications SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [parsed.data.decision, session.userId, applicationId],
    );
    if (parsed.data.decision === "ACCEPTED") {
      await connection.execute(
        `INSERT INTO team_members (team_id, user_id, role, status, invited_by, joined_at)
         VALUES (?, ?, ?, 'ACTIVE', ?, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'ACTIVE', invited_by = VALUES(invited_by), joined_at = CURRENT_TIMESTAMP(3)`,
        [teamId, application.applicant_user_id, parsed.data.role ?? application.desired_role, session.userId],
      );
    }
    await connection.execute(
      `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
       VALUES (?, ?, 'TEAM_APPLICATION_REVIEWED', 'TEAMS', ?, ?, ?)`,
      [randomUUID(), application.applicant_user_id,
        parsed.data.decision === "ACCEPTED" ? "Team application accepted" : "Team application denied",
        `${application.team_name} ${parsed.data.decision === "ACCEPTED" ? "accepted" : "denied"} your application.`,
        `/teams/${application.slug}`],
    );
  });
  return NextResponse.json({ success: true });
}
