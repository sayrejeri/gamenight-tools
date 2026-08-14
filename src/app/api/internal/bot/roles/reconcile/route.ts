import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { enqueueDiscordBotJob, type BotRoleKind } from "@/lib/bot-jobs";
import { isAuthorizedBotWorker } from "@/lib/bot-worker-auth";

type AssignmentRow = RowDataPacket & {
  workspace_id: string;
  user_id: string;
  role_kind: BotRoleKind;
  role_id: string;
  source_event_id: string | null;
  updated_at: Date;
  bot_connected: number;
  role_sync_enabled: number;
  configured_role_id: string | null;
};

type ExistsRow = RowDataPacket & { found: number };

const ACTIVE_EVENT_STATUSES = ["SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE", "POSTPONED"] as const;

async function hasActiveCompetition(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await query<ExistsRow[]>(
    `SELECT EXISTS(
       SELECT 1 FROM events e
       WHERE e.workspace_id = ? AND e.status IN (${ACTIVE_EVENT_STATUSES.map(() => "?").join(",")})
         AND (
           EXISTS(
             SELECT 1 FROM event_participants ep
             WHERE ep.event_id = e.id AND ep.user_id = ? AND ep.status = 'APPROVED'
           )
           OR EXISTS(
             SELECT 1 FROM event_team_entries ete
             WHERE ete.event_id = e.id AND ete.status = 'REGISTERED'
               AND JSON_SEARCH(ete.roster_json, 'one', ?, NULL, '$[*].userId') IS NOT NULL
           )
         )
     ) AS found`,
    [workspaceId, ...ACTIVE_EVENT_STATUSES, userId, userId],
  );
  return Boolean(rows[0]?.found);
}

async function isStillChampion(eventId: string, userId: string): Promise<boolean> {
  const rows = await query<ExistsRow[]>(
    `SELECT EXISTS(
       SELECT 1
       FROM bracket_entries be
       INNER JOIN brackets br ON br.id = be.bracket_id
       WHERE br.event_id = ? AND br.status = 'COMPLETED' AND be.status = 'ADVANCED'
         AND (
           be.user_id = ?
           OR EXISTS(
             SELECT 1 FROM event_team_entries ete
             WHERE ete.event_id = ? AND ete.team_id = be.team_id AND ete.status = 'REGISTERED'
               AND JSON_SEARCH(ete.roster_json, 'one', ?, NULL, '$[*].userId') IS NOT NULL
           )
         )
     ) AS found`,
    [eventId, userId, eventId, userId],
  );
  return Boolean(rows[0]?.found);
}

export async function POST(request: Request) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });

  const assignments = await query<AssignmentRow[]>(
    `SELECT dra.workspace_id, CAST(dra.user_id AS CHAR) AS user_id, dra.role_kind, dra.role_id,
            dra.source_event_id, dra.updated_at, w.bot_connected,
            COALESCE(wbs.role_sync_enabled, 0) AS role_sync_enabled,
            CASE WHEN dra.role_kind = 'CHAMPION' THEN wbs.champion_role_id ELSE wbs.competitor_role_id END AS configured_role_id
     FROM discord_role_assignments dra
     INNER JOIN workspaces w ON w.id = dra.workspace_id
     LEFT JOIN workspace_bot_settings wbs ON wbs.workspace_id = dra.workspace_id
     WHERE dra.status = 'ACTIVE'
     ORDER BY dra.updated_at ASC
     LIMIT 500`,
  );

  let queued = 0;
  let retained = 0;
  for (const assignment of assignments) {
    if (!assignment.bot_connected) {
      retained += 1;
      continue;
    }

    let remove = !assignment.role_sync_enabled || assignment.configured_role_id !== assignment.role_id;
    if (!remove && assignment.role_kind === "COMPETITOR") {
      remove = !await hasActiveCompetition(assignment.workspace_id, assignment.user_id);
    }
    if (!remove && assignment.role_kind === "CHAMPION" && assignment.source_event_id) {
      remove = !await isStillChampion(assignment.source_event_id, assignment.user_id);
    }

    if (!remove) {
      retained += 1;
      continue;
    }

    const version = new Date(assignment.updated_at).getTime();
    const inserted = await enqueueDiscordBotJob({
      workspaceId: assignment.workspace_id,
      userId: assignment.user_id,
      eventId: assignment.source_event_id,
      roleKind: assignment.role_kind,
      roleId: assignment.role_id,
      type: "SYNC_ROLE",
      dedupeKey: `tracked-role-remove:${assignment.workspace_id}:${assignment.user_id}:${version}`,
      payload: { roleKind: assignment.role_kind, action: "REMOVE" },
    });
    if (inserted) queued += 1;
  }

  return NextResponse.json({ success: true, checked: assignments.length, retained, queued });
}
