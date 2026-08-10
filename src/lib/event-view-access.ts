import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";

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

export type EventViewerAccess = {
  event: EventAccessRow | null;
  manager: boolean;
  participant: boolean;
  guildMember: boolean;
  canView: boolean;
};

const EVENT_MANAGER_PERMISSIONS = [
  "HOST_EVENTS",
  "MANAGE_EVENTS",
  "APPROVE_EVENTS",
  "MANAGE_PARTICIPANTS",
  "MANAGE_BRACKETS",
] as const;

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
  if (!event) return { event: null, manager: false, participant: false, guildMember: false, canView: false };

  if (!userId) {
    const externallyVisible = !["DRAFT", "AWAITING_APPROVAL"].includes(event.status);
    return {
      event,
      manager: false,
      participant: false,
      guildMember: false,
      canView: externallyVisible && event.visibility === "PUBLIC",
    };
  }

  const [workspaceAccess, cohosts, participants] = await Promise.all([
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
  ]);

  const manager = event.primary_host_id === userId
    || EVENT_MANAGER_PERMISSIONS.some((permission) => workspaceAccess.permissions.includes(permission))
    || Boolean(cohosts[0]);
  const participant = Boolean(participants[0]);
  const guildMember = Boolean(event.user_in_guild);
  const restrictedStatus = ["DRAFT", "AWAITING_APPROVAL"].includes(event.status);
  const canView = restrictedStatus
    ? manager
    : event.visibility === "PUBLIC"
      || event.visibility === "UNLISTED"
      || (event.visibility === "SERVER" && guildMember)
      || manager
      || participant;

  return { event, manager, participant, guildMember, canView };
}

export function eventIsDiscoverableToAnonymous(status: string, visibility: EventVisibility): boolean {
  return !["DRAFT", "AWAITING_APPROVAL"].includes(status) && visibility === "PUBLIC";
}
