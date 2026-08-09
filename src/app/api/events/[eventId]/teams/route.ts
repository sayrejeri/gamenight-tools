import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const teamSchema = z.object({ teamId: z.string().uuid() });

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  primary_host_id: string;
  status: string;
  bracket_enabled: number;
  bracket_entry_mode: string;
  max_participants: number | null;
};
type CohostRow = RowDataPacket & { permission_level: string };
type TeamRoleRow = RowDataPacket & { role: string };
type RosterRow = RowDataPacket & { user_id: string; display_name: string; role: string };

async function loadEvent(eventId: string): Promise<EventRow | null> {
  const rows = await query<EventRow[]>(
    `SELECT id, workspace_id, CAST(primary_host_id AS CHAR) AS primary_host_id, status,
            bracket_enabled, bracket_entry_mode, max_participants
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  return rows[0] ?? null;
}

async function teamEntryManager(userId: string, event: EventRow): Promise<boolean> {
  if (event.primary_host_id === userId || await hasWorkspacePermission(userId, event.workspace_id, "MANAGE_PARTICIPANTS")) return true;
  const cohosts = await query<CohostRow[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED'
       AND permission_level IN ('FULL', 'SIGNUPS') LIMIT 1`,
    [event.id, userId],
  );
  return Boolean(cohosts[0]);
}

async function userTeamRole(userId: string, teamId: string): Promise<string | null> {
  const rows = await query<TeamRoleRow[]>(
    `SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    [teamId, userId],
  );
  return rows[0]?.role ?? null;
}

async function snapshotRoster(connection: Parameters<Parameters<typeof withTransaction>[0]>[0], teamId: string) {
  const [rows] = await connection.query<RosterRow[]>(
    `SELECT CAST(tm.user_id AS CHAR) AS user_id,
            COALESCE(NULLIF(u.global_name, ''), u.site_username, u.username) AS display_name,
            tm.role
     FROM team_members tm INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.status = 'ACTIVE'
       AND tm.role IN ('OWNER', 'MANAGER', 'CAPTAIN', 'PLAYER', 'SUBSTITUTE')
     ORDER BY FIELD(tm.role, 'OWNER', 'CAPTAIN', 'MANAGER', 'PLAYER', 'SUBSTITUTE'), COALESCE(u.global_name, u.site_username, u.username)`,
    [teamId],
  );
  return rows.map((row) => ({ userId: row.user_id, name: row.display_name, role: row.role }));
}

export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const event = await loadEvent(eventId);
  if (!event || !event.bracket_enabled || event.bracket_entry_mode !== "TEAM") return NextResponse.json({ error: "This is not a team tournament." }, { status: 404 });
  const canManage = await teamEntryManager(session.userId, event);

  const registered = await query<(RowDataPacket & {
    team_id: string; name: string; tag: string | null; logo_url: string | null; status: string; roster_json: string | null; captain_user_id: string | null;
  })[]>(
    `SELECT ete.team_id, t.name, t.tag, t.logo_url, ete.status, ete.roster_json, CAST(ete.captain_user_id AS CHAR) AS captain_user_id
     FROM event_team_entries ete INNER JOIN teams t ON t.id = ete.team_id
     WHERE ete.event_id = ? AND ete.status = 'REGISTERED'
     ORDER BY COALESCE(ete.seed_number, 2147483647), ete.registered_at ASC`,
    [eventId],
  );
  const eligible = await query<(RowDataPacket & { id: string; name: string; tag: string | null; logo_url: string | null; my_role: string | null })[]>(
    `SELECT t.id, t.name, t.tag, t.logo_url,
            (SELECT tm.role FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = ? AND tm.status = 'ACTIVE' LIMIT 1) AS my_role
     FROM teams t
     WHERE t.profile_status = 'APPROVED'
       AND (t.home_workspace_id = ? OR EXISTS(
         SELECT 1 FROM team_members mine WHERE mine.team_id = t.id AND mine.user_id = ? AND mine.status = 'ACTIVE'
       ))
     ORDER BY t.name ASC LIMIT 250`,
    [session.userId, event.workspace_id, session.userId],
  );
  const registeredIds = new Set(registered.map((team) => team.team_id));

  return NextResponse.json({
    canManage,
    eventStatus: event.status,
    maxTeams: event.max_participants,
    registered: registered.map((team) => ({
      teamId: team.team_id,
      name: team.name,
      tag: team.tag,
      logoUrl: team.logo_url,
      captainUserId: team.captain_user_id,
      roster: (() => { try { return JSON.parse(team.roster_json ?? "[]"); } catch { return []; } })(),
      canWithdraw: canManage || team.captain_user_id === session.userId,
    })),
    eligible: eligible.filter((team) => !registeredIds.has(team.id)).map((team) => ({
      teamId: team.id,
      name: team.name,
      tag: team.tag,
      logoUrl: team.logo_url,
      myRole: team.my_role,
      canRegister: canManage || ["OWNER", "MANAGER", "CAPTAIN"].includes(team.my_role ?? ""),
    })),
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = teamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid team." }, { status: 400 });
  const event = await loadEvent(eventId);
  if (!event || !event.bracket_enabled || event.bracket_entry_mode !== "TEAM") return NextResponse.json({ error: "This is not a team tournament." }, { status: 404 });
  if (["LIVE", "COMPLETED", "CANCELLED"].includes(event.status)) return NextResponse.json({ error: "Team registration is closed for this event." }, { status: 409 });

  const canManage = await teamEntryManager(session.userId, event);
  const role = await userTeamRole(session.userId, parsed.data.teamId);
  if (!canManage && !["OWNER", "MANAGER", "CAPTAIN"].includes(role ?? "")) return NextResponse.json({ error: "Only the team owner, manager, captain, or event staff can register this team." }, { status: 403 });
  if (!canManage && event.status !== "SIGNUPS_OPEN") return NextResponse.json({ error: "Team signups are not open right now." }, { status: 409 });

  const teams = await query<(RowDataPacket & { id: string; profile_status: string })[]>(`SELECT id, profile_status FROM teams WHERE id = ? LIMIT 1`, [parsed.data.teamId]);
  if (!teams[0] || teams[0].profile_status !== "APPROVED") return NextResponse.json({ error: "That team is not available for tournament registration." }, { status: 404 });

  await withTransaction(async (connection) => {
    const [countRows] = await connection.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM event_team_entries WHERE event_id = ? AND status = 'REGISTERED' FOR UPDATE`,
      [eventId],
    );
    const [existingRows] = await connection.query<(RowDataPacket & { status: string })[]>(
      `SELECT status FROM event_team_entries WHERE event_id = ? AND team_id = ? LIMIT 1 FOR UPDATE`,
      [eventId, parsed.data.teamId],
    );
    if (!existingRows[0] && event.max_participants && Number(countRows[0]?.total ?? 0) >= event.max_participants) throw new Error("TEAM_LIMIT_REACHED");
    const roster = await snapshotRoster(connection, parsed.data.teamId);
    const captain = roster.find((member) => member.role === "CAPTAIN") ?? roster.find((member) => member.role === "OWNER") ?? roster[0] ?? null;
    await connection.execute(
      `INSERT INTO event_team_entries (event_id, team_id, status, captain_user_id, registered_by, roster_json)
       VALUES (?, ?, 'REGISTERED', ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = 'REGISTERED', captain_user_id = VALUES(captain_user_id),
         registered_by = VALUES(registered_by), roster_json = VALUES(roster_json), updated_at = CURRENT_TIMESTAMP(3)`,
      [eventId, parsed.data.teamId, captain?.userId ?? null, session.userId, JSON.stringify(roster)],
    );
  }).catch((error) => {
    if (error instanceof Error && error.message === "TEAM_LIMIT_REACHED") throw error;
    throw error;
  });

  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.team_registered", targetType: "team", targetId: parsed.data.teamId, details: { role, byStaff: canManage } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = teamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid team." }, { status: 400 });
  const event = await loadEvent(eventId);
  if (!event || event.bracket_entry_mode !== "TEAM") return NextResponse.json({ error: "This is not a team tournament." }, { status: 404 });
  if (["LIVE", "COMPLETED"].includes(event.status)) return NextResponse.json({ error: "Reopen or reset the event before removing tournament teams." }, { status: 409 });
  const canManage = await teamEntryManager(session.userId, event);
  const role = await userTeamRole(session.userId, parsed.data.teamId);
  if (!canManage && !["OWNER", "MANAGER", "CAPTAIN"].includes(role ?? "")) return NextResponse.json({ error: "You cannot withdraw this team." }, { status: 403 });

  await query(`UPDATE event_team_entries SET status = 'WITHDRAWN', updated_at = CURRENT_TIMESTAMP(3) WHERE event_id = ? AND team_id = ?`, [eventId, parsed.data.teamId]);
  await writeAuditLog({ actorUserId: session.userId, workspaceId: event.workspace_id, eventId, action: "event.team_withdrawn", targetType: "team", targetId: parsed.data.teamId, details: { role, byStaff: canManage } });
  return NextResponse.json({ success: true });
}
