import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { query, withTransaction } from "@/lib/db";
import { hasPlatformPermission } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tag: z.string().trim().max(16).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  logoUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  bannerUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
  mainPlatform: z.string().trim().max(80).optional().default(""),
  mainGame: z.string().trim().max(191).optional().default(""),
  region: z.string().trim().max(80).optional().default(""),
  recruitingStatus: z.enum(["OPEN", "INVITE_ONLY", "CLOSED"]),
  profileStatus: z.enum(["PENDING", "APPROVED", "CHANGES_REQUESTED", "DENIED", "SUSPENDED", "ARCHIVED"]),
  verificationLevel: z.enum(["APPROVED", "OWNERSHIP_VERIFIED", "OFFICIAL", "PARTNER"]).nullable().optional().default(null),
  chatEnabled: z.boolean().default(false),
  suggestionsEnabled: z.boolean().default(true),
});

type TeamRow = RowDataPacket & {
  id: string;
  name: string;
  tag: string | null;
  profile_status: string;
  verification_level: string | null;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!await hasPlatformPermission(session.userId, "MANAGE_TEAMS")) {
    return NextResponse.json({ error: "Manage Team Profiles permission is required." }, { status: 403 });
  }

  const { teamId } = await context.params;
  const teams = await query<TeamRow[]>(
    `SELECT id, name, tag, profile_status, verification_level FROM teams WHERE id = ? LIMIT 1`,
    [teamId],
  );
  const current = teams[0];
  if (!current) return NextResponse.json({ error: "Team profile was not found." }, { status: 404 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the team profile fields." }, { status: 400 });

  const statusChanged = current.profile_status !== parsed.data.profileStatus;
  const verificationChanged = current.verification_level !== parsed.data.verificationLevel;

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE teams
       SET name = ?, tag = ?, description = ?, logo_url = ?, banner_url = ?, main_platform = ?, main_game = ?, region = ?,
           recruiting_status = ?, profile_status = ?, verification_level = ?, chat_enabled = ?, suggestions_enabled = ?,
           reviewed_by = CASE WHEN ? = 1 THEN ? ELSE reviewed_by END,
           reviewed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP(3) ELSE reviewed_at END,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        parsed.data.name,
        parsed.data.tag || null,
        parsed.data.description || null,
        parsed.data.logoUrl || null,
        parsed.data.bannerUrl || null,
        parsed.data.mainPlatform || null,
        parsed.data.mainGame || null,
        parsed.data.region || null,
        parsed.data.recruitingStatus,
        parsed.data.profileStatus,
        parsed.data.verificationLevel,
        parsed.data.chatEnabled ? 1 : 0,
        parsed.data.suggestionsEnabled ? 1 : 0,
        statusChanged ? 1 : 0,
        session.userId,
        statusChanged ? 1 : 0,
        teamId,
      ],
    );

    await writeAuditLog({
      actorUserId: session.userId,
      action: "platform.team.profile.update",
      targetType: "TEAM",
      targetId: teamId,
      severity: statusChanged || verificationChanged ? "PERMISSIONS" : "INFO",
      sensitive: statusChanged || verificationChanged,
      details: {
        before: { name: current.name, tag: current.tag, profileStatus: current.profile_status, verificationLevel: current.verification_level },
        after: { name: parsed.data.name, tag: parsed.data.tag || null, profileStatus: parsed.data.profileStatus, verificationLevel: parsed.data.verificationLevel },
      },
    }, connection);
  });

  return NextResponse.json({ success: true });
}
