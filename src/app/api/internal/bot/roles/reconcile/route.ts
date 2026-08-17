import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool, query } from "@/lib/db";
import type { BotRoleKind } from "@/lib/bot-jobs";
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
  has_active_competition: number;
  still_champion: number;
};

export async function POST(request: Request) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });

  // Resolve current role eligibility in one read. This avoids an N+1 query pattern
  // when a large workspace has hundreds of tracked bot-managed assignments.
  const assignments = await query<AssignmentRow[]>(
    `SELECT dra.workspace_id, CAST(dra.user_id AS CHAR) AS user_id, dra.role_kind, dra.role_id,
            dra.source_event_id, dra.updated_at, w.bot_connected,
            COALESCE(wbs.role_sync_enabled, 0) AS role_sync_enabled,
            CASE WHEN dra.role_kind = 'CHAMPION' THEN wbs.champion_role_id ELSE wbs.competitor_role_id END AS configured_role_id,
            EXISTS(
              SELECT 1 FROM events ae
              WHERE ae.workspace_id = dra.workspace_id
                AND ae.status IN ('SIGNUPS_OPEN','SIGNUPS_CLOSED','CHECK_IN_OPEN','LIVE','POSTPONED')
                AND (
                  EXISTS(
                    SELECT 1 FROM event_participants aep
                    WHERE aep.event_id = ae.id AND aep.user_id = dra.user_id AND aep.status = 'APPROVED'
                  )
                  OR EXISTS(
                    SELECT 1 FROM event_team_entries aete
                    WHERE aete.event_id = ae.id AND aete.status = 'REGISTERED'
                      AND JSON_SEARCH(aete.roster_json, 'one', CAST(dra.user_id AS CHAR), NULL, '$[*].userId') IS NOT NULL
                  )
                )
            ) AS has_active_competition,
            CASE
              WHEN dra.source_event_id IS NULL THEN 1
              ELSE EXISTS(
                SELECT 1
                FROM bracket_entries be
                INNER JOIN brackets br ON br.id = be.bracket_id
                WHERE br.event_id = dra.source_event_id AND br.status = 'COMPLETED' AND be.status = 'ADVANCED'
                  AND (
                    be.user_id = dra.user_id
                    OR EXISTS(
                      SELECT 1 FROM event_team_entries ete
                      WHERE ete.event_id = dra.source_event_id AND ete.team_id = be.team_id AND ete.status = 'REGISTERED'
                        AND JSON_SEARCH(ete.roster_json, 'one', CAST(dra.user_id AS CHAR), NULL, '$[*].userId') IS NOT NULL
                    )
                  )
              )
            END AS still_champion
     FROM discord_role_assignments dra
     INNER JOIN workspaces w ON w.id = dra.workspace_id
     LEFT JOIN workspace_bot_settings wbs ON wbs.workspace_id = dra.workspace_id
     WHERE dra.status = 'ACTIVE'
     ORDER BY dra.updated_at ASC
     LIMIT 500`,
  );

  const removals: AssignmentRow[] = [];
  let retained = 0;
  for (const assignment of assignments) {
    if (!assignment.bot_connected) {
      retained += 1;
      continue;
    }

    const configurationChanged = !assignment.role_sync_enabled || assignment.configured_role_id !== assignment.role_id;
    const eligibilityEnded = assignment.role_kind === "COMPETITOR"
      ? !assignment.has_active_competition
      : !assignment.still_champion;

    if (configurationChanged || eligibilityEnded) removals.push(assignment);
    else retained += 1;
  }

  if (!removals.length) {
    return NextResponse.json({ success: true, checked: assignments.length, retained, queued: 0 });
  }

  const values: Array<string | null> = [];
  const placeholders = removals.map((assignment) => {
    const version = new Date(assignment.updated_at).getTime();
    const dedupeKey = `tracked-role-remove:${assignment.workspace_id}:${assignment.user_id}:${version}:${assignment.role_kind}:${assignment.role_id}`.slice(0, 191);
    values.push(
      randomUUID(),
      assignment.workspace_id,
      assignment.user_id,
      assignment.source_event_id,
      assignment.role_kind,
      assignment.role_id,
      dedupeKey,
      JSON.stringify({ roleKind: assignment.role_kind, action: "REMOVE" }),
    );
    return "(?, ?, ?, ?, ?, ?, 'SYNC_ROLE', ?, ?, CURRENT_TIMESTAMP(3))";
  });

  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT IGNORE INTO discord_bot_jobs
      (id, workspace_id, user_id, event_id, role_kind, discord_role_id, job_type, dedupe_key, payload_json, scheduled_at)
     VALUES ${placeholders.join(",")}`,
    values,
  );

  return NextResponse.json({
    success: true,
    checked: assignments.length,
    retained,
    queued: Number(result.affectedRows ?? 0),
  });
}
