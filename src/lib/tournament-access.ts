import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";

type TournamentEventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  name: string;
  primary_host_id: string;
  status: string;
  bracket_enabled: number;
};

type CohostRow = RowDataPacket & { permission_level: string };

export type TournamentAccess = {
  event: TournamentEventRow | null;
  manager: boolean;
  cohostLevel: string;
};

export async function getTournamentAccess(userId: string, eventId: string): Promise<TournamentAccess> {
  const events = await query<TournamentEventRow[]>(
    `SELECT id, workspace_id, name, CAST(primary_host_id AS CHAR) AS primary_host_id,
            status, bracket_enabled
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0] ?? null;
  if (!event) return { event: null, manager: false, cohostLevel: "" };

  const [workspaceAccess, cohosts] = await Promise.all([
    getWorkspacePermissionSnapshot(userId, event.workspace_id),
    query<CohostRow[]>(
      `SELECT permission_level FROM event_cohosts
       WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
      [eventId, userId],
    ),
  ]);
  const cohostLevel = cohosts[0]?.permission_level ?? "";
  const manager = event.primary_host_id === userId
    || workspaceAccess.permissions.includes("MANAGE_BRACKETS")
    || workspaceAccess.permissions.includes("MANAGE_PARTICIPANTS")
    || ["FULL", "BRACKET", "SCOREKEEPER"].includes(cohostLevel);

  return { event, manager, cohostLevel };
}
