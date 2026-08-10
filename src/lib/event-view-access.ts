import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getPlatformPermissionSnapshot, getWorkspacePermissionSnapshot } from "@/lib/permissions";
import {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLE_DEFAULTS,
  getEffectivePermissions,
  parsePermissionOverrides,
  type WorkspacePermission,
} from "@/lib/permission-catalog";

export type EventVisibility = "SERVER" | "CODE_ONLY" | "UNLISTED" | "PUBLIC" | "STAFF_ONLY";

type EventAccessRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  primary_host_id: string;
  status: string;
  visibility: EventVisibility;
  user_in_guild: number;
};
type CohostRow = RowDataPacket & { permission_level: string };
type ParticipantRow = RowDataPacket & { status: string };
type TeamRosterRow = RowDataPacket & { roster_json: string | null };
type WorkspaceManagerRow = RowDataPacket & { workspace_id: string; role: string; permissions_json: string | null };

export type EventViewerAccess = {
  event: EventAccessRow | null;
  manager: boolean;
  participant: boolean;
  teamRosterMember: boolean;
  guildMember: boolean;
  canView: boolean;
};

export type EventManagerWorkspaceScope = { allWorkspaces: boolean; workspaceIds: string[] };

const EVENT_MANAGER_PERMISSIONS: readonly WorkspacePermission[] = [
  "HOST_EVENTS",
  "MANAGE_EVENTS",
  "APPROVE_EVENTS",
  "MANAGE_PARTICIPANTS",
  "MANAGE_BRACKETS",
];

function rosterContains(value: string | null, userId: string): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.some((member) => member && typeof member === "object" && (member as { userId?: unknown }).userId === userId);
  } catch {
    return false;
  }
}

export async function getEventManagerWorkspaceScope(userId: string): Promise<EventManagerWorkspaceScope> {
  const [platformAccess, memberships] = await Promise.all([
    getPlatformPermissionSnapshot(userId),
    query<WorkspaceManagerRow[]>(
      `SELECT workspace_id, role, permissions_json
       FROM workspace_members
       WHERE user_id = ? AND status = 'ACTIVE'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(3))`,
      [userId],
    ),
  ]);

  if (platformAccess.role === "OWNER" || platformAccess.permissions.includes("MANAGE_SERVERS")) {
    return { allWorkspaces: true, workspaceIds: [] };
  }

  const workspaceIds = memberships.flatMap((membership) => {
    const defaults = (WORKSPACE_ROLE_DEFAULTS[membership.role] ?? []) as readonly WorkspacePermission[];
    const permissions = getEffectivePermissions(
      defaults,
      parsePermissionOverrides(membership.permissions_json, WORKSPACE_PERMISSIONS),
      WORKSPACE_PERMISSIONS,
    );
    return EVENT_MANAGER_PERMISSIONS.some((permission) => permissions.includes(permission)) ? [membership.workspace_id] : [];
  });
  return { allWorkspaces: false, workspaceIds: [...new Set(workspaceIds)] };
}

export async function getEventViewerAccess(userId: string | null, eventId: string): Promise<EventViewerAccess> {
  const events = await query<EventAccessRow[]>(
    `SELECT e.id, e.workspace_id, CAST(e.primary_host_id AS CHAR) AS primary_host_id,
            e.status, e.visibility,
            ${userId ? "EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id)" : "0"} AS user_in_guild
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     WHERE e.id = ? LIMIT 1`,
    userId ? [userId, eventId] : [eventId],
  );
  const event = events[0] ?? null;
  if (!event) return { event: null, manager: false, participant: false, teamRosterMember: false, guildMember: false, canView: false };

  if (!userId) {
    const externallyVisible = !["DRAFT", "AWAITING_APPROVAL"].includes(event.status);
    return {
      event,
      manager: false,
      participant: false,
      teamRosterMember: false,
      guildMember: false,
      canView: externallyVisible && event.visibility === "PUBLIC",
    };
  }

  const [workspaceAccess, cohosts, participants, teamRows] = await Promise.all([
    getWorkspacePermissionSnapshot(userId, event.workspace_id),
    query<CohostRow[]>(
      `SELECT permission_level FROM event_cohosts
       WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
      [eventId, userId],
    ),
    query<ParticipantRow[]>(
      `SELECT status FROM event_participants
       WHERE event_id = ? AND user_id = ? AND status NOT IN ('REJECTED', 'WITHDRAWN') LIMIT 1`,
      [eventId, userId],
    ),
    query<TeamRosterRow[]>(
      `SELECT roster_json FROM event_team_entries WHERE event_id = ? AND status = 'REGISTERED'`,
      [eventId],
    ),
  ]);

  const manager = event.primary_host_id === userId
    || EVENT_MANAGER_PERMISSIONS.some((permission) => workspaceAccess.permissions.includes(permission))
    || Boolean(cohosts[0]);
  const participant = Boolean(participants[0]);
  const teamRosterMember = teamRows.some((row) => rosterContains(row.roster_json, userId));
  const entrant = participant || teamRosterMember;
  const guildMember = Boolean(event.user_in_guild);
  const restrictedStatus = ["DRAFT", "AWAITING_APPROVAL"].includes(event.status);

  let canView = false;
  if (restrictedStatus) canView = manager;
  else if (event.visibility === "PUBLIC" || event.visibility === "UNLISTED") canView = true;
  else if (event.visibility === "SERVER") canView = manager || entrant || guildMember;
  else if (event.visibility === "CODE_ONLY") canView = manager || entrant;
  else if (event.visibility === "STAFF_ONLY") canView = manager;

  return { event, manager, participant, teamRosterMember, guildMember, canView };
}

export function eventIsDiscoverableToAnonymous(status: string, visibility: EventVisibility): boolean {
  return !["DRAFT", "AWAITING_APPROVAL"].includes(status) && visibility === "PUBLIC";
}
