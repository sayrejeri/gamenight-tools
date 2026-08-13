import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { canManageTeamIdentity, getActiveTeamRole } from "@/lib/team-access";
import { writeAuditLog } from "@/lib/audit";

const requestSchema = z.object({
  teamId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  initiatedBy: z.enum(["TEAM", "WORKSPACE"]),
});

const decisionSchema = z.object({
  teamId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  decision: z.enum(["APPROVE", "DENY", "REVOKE"]),
});

type IdentityRow = RowDataPacket & {
  team_name: string;
  team_owner_user_id: string;
  team_status: string;
  workspace_name: string;
  workspace_status: string;
};

type AffiliationRow = RowDataPacket & {
  status: "PENDING" | "APPROVED" | "DENIED" | "REVOKED";
  initiated_by_scope: "TEAM" | "WORKSPACE";
  initiated_by_user_id: string;
};

type RecipientRow = RowDataPacket & { user_id: string };

async function loadIdentity(teamId: string, workspaceId: string): Promise<IdentityRow | null> {
  const rows = await query<IdentityRow[]>(
    `SELECT t.name AS team_name, CAST(t.owner_user_id AS CHAR) AS team_owner_user_id, t.profile_status AS team_status,
            w.name AS workspace_name, w.profile_status AS workspace_status
     FROM teams t CROSS JOIN workspaces w
     WHERE t.id = ? AND w.id = ? LIMIT 1`,
    [teamId, workspaceId],
  );
  return rows[0] ?? null;
}

async function notifyUsers(userIds: string[], title: string, message: string) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  await withTransaction(async (connection) => {
    for (const userId of unique) {
      await connection.execute(
        `INSERT INTO notifications (id, user_id, notification_type, category, title, message, action_url)
         VALUES (?, ?, 'TEAM_SERVER_AFFILIATION', 'PROFILES', ?, ?, '/dashboard/team-server-identity')`,
        [randomUUID(), userId, title, message],
      );
    }
  });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid team/server affiliation request." }, { status: 400 });

  const { teamId, workspaceId, initiatedBy } = parsed.data;
  const identity = await loadIdentity(teamId, workspaceId);
  if (!identity) return NextResponse.json({ error: "Team or server profile not found." }, { status: 404 });
  if (identity.team_status !== "APPROVED" || identity.workspace_status !== "APPROVED") {
    return NextResponse.json({ error: "Only approved team and server profiles can be affiliated." }, { status: 409 });
  }

  if (initiatedBy === "TEAM") {
    const role = await getActiveTeamRole(session.userId, teamId);
    if (!canManageTeamIdentity(role)) return NextResponse.json({ error: "Team Owner or Manager access is required." }, { status: 403 });
  } else if (!(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_TEAMS"))) {
    return NextResponse.json({ error: "Manage Teams permission is required for this server." }, { status: 403 });
  }

  const existing = (await query<AffiliationRow[]>(
    `SELECT status, initiated_by_scope, CAST(initiated_by_user_id AS CHAR) AS initiated_by_user_id
     FROM team_workspace_affiliations WHERE team_id = ? AND workspace_id = ? LIMIT 1`,
    [teamId, workspaceId],
  ))[0];
  if (existing?.status === "APPROVED") return NextResponse.json({ error: "This team is already approved for that server." }, { status: 409 });
  if (existing?.status === "PENDING") return NextResponse.json({ error: "An affiliation request is already waiting for a response." }, { status: 409 });

  await withTransaction(async (connection) => {
    if (existing) {
      await connection.execute(
        `UPDATE team_workspace_affiliations
         SET status = 'PENDING', initiated_by_scope = ?, initiated_by_user_id = ?, reviewed_by_user_id = NULL,
             requested_at = CURRENT_TIMESTAMP(3), reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP(3)
         WHERE team_id = ? AND workspace_id = ?`,
        [initiatedBy, session.userId, teamId, workspaceId],
      );
    } else {
      await connection.execute(
        `INSERT INTO team_workspace_affiliations
          (team_id, workspace_id, status, initiated_by_scope, initiated_by_user_id)
         VALUES (?, ?, 'PENDING', ?, ?)`,
        [teamId, workspaceId, initiatedBy, session.userId],
      );
    }
  });

  if (initiatedBy === "TEAM") {
    const owners = await query<RecipientRow[]>(
      `SELECT CAST(user_id AS CHAR) AS user_id FROM workspace_members
       WHERE workspace_id = ? AND status = 'ACTIVE' AND role = 'OWNER'`,
      [workspaceId],
    );
    await notifyUsers(owners.map((row) => row.user_id), "Team affiliation request", `${identity.team_name} wants to be approved for ${identity.workspace_name}.`);
  } else {
    await notifyUsers([identity.team_owner_user_id], "Server affiliation invitation", `${identity.workspace_name} invited ${identity.team_name} to become an approved server team.`);
  }

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId,
    action: initiatedBy === "TEAM" ? "team.affiliation.requested" : "workspace.team.invited",
    targetType: "team",
    targetId: teamId,
    details: { workspaceId, initiatedBy },
  });
  return NextResponse.json({ success: true, status: "PENDING" }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid affiliation decision." }, { status: 400 });

  const { teamId, workspaceId, decision } = parsed.data;
  const identity = await loadIdentity(teamId, workspaceId);
  if (!identity) return NextResponse.json({ error: "Team or server profile not found." }, { status: 404 });
  const affiliation = (await query<AffiliationRow[]>(
    `SELECT status, initiated_by_scope, CAST(initiated_by_user_id AS CHAR) AS initiated_by_user_id
     FROM team_workspace_affiliations WHERE team_id = ? AND workspace_id = ? LIMIT 1`,
    [teamId, workspaceId],
  ))[0];
  if (!affiliation) return NextResponse.json({ error: "Affiliation not found." }, { status: 404 });

  const [teamRole, canManageWorkspace] = await Promise.all([
    getActiveTeamRole(session.userId, teamId),
    hasWorkspacePermission(session.userId, workspaceId, "MANAGE_TEAMS"),
  ]);
  const canManageTeam = canManageTeamIdentity(teamRole);

  if (decision === "REVOKE") {
    if (affiliation.status !== "APPROVED") return NextResponse.json({ error: "Only an approved affiliation can be revoked." }, { status: 409 });
    if (!canManageTeam && !canManageWorkspace) return NextResponse.json({ error: "Team or server management access is required." }, { status: 403 });
  } else {
    if (affiliation.status !== "PENDING") return NextResponse.json({ error: "This affiliation is no longer waiting for a decision." }, { status: 409 });
    const receiverCanDecide = affiliation.initiated_by_scope === "TEAM" ? canManageWorkspace : canManageTeam;
    if (!receiverCanDecide) return NextResponse.json({ error: "Only the receiving team/server can decide this request." }, { status: 403 });
  }

  const nextStatus = decision === "APPROVE" ? "APPROVED" : decision === "DENY" ? "DENIED" : "REVOKED";
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE team_workspace_affiliations
       SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE team_id = ? AND workspace_id = ?`,
      [nextStatus, session.userId, teamId, workspaceId],
    );
  });

  if (decision !== "REVOKE" && affiliation.initiated_by_user_id !== String(session.userId)) {
    await notifyUsers(
      [affiliation.initiated_by_user_id],
      decision === "APPROVE" ? "Team affiliation approved" : "Team affiliation declined",
      `${identity.team_name} and ${identity.workspace_name}: ${nextStatus.toLowerCase()}.`,
    );
  }

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId,
    action: `team.affiliation.${nextStatus.toLowerCase()}`,
    targetType: "team",
    targetId: teamId,
    details: { workspaceId, previousStatus: affiliation.status, initiatedBy: affiliation.initiated_by_scope },
  });
  return NextResponse.json({ success: true, status: nextStatus });
}
