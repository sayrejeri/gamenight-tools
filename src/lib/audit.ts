import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "@/lib/db";

export type AuditSeverity = "INFO" | "MODERATION" | "PERMISSIONS" | "SECURITY";

type AuditExecutor = Pick<PoolConnection, "execute">;

export async function writeAuditLog(input: {
  actorUserId: string;
  action: string;
  workspaceId?: string | null;
  eventId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: unknown;
  severity?: AuditSeverity;
  sensitive?: boolean;
}, executor?: AuditExecutor) {
  const target: AuditExecutor = executor ?? getPool();
  await target.execute(
    `INSERT INTO audit_logs
      (id, workspace_id, event_id, actor_user_id, action_name, severity, is_sensitive, target_type, target_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.workspaceId ?? null,
      input.eventId ?? null,
      input.actorUserId,
      input.action,
      input.severity ?? "INFO",
      input.sensitive ? 1 : 0,
      input.targetType ?? null,
      input.targetId ?? null,
      input.details === undefined ? null : JSON.stringify(input.details),
    ],
  );
}
