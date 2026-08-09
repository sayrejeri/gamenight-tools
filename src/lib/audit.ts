import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";

export type AuditSeverity = "INFO" | "MODERATION" | "PERMISSIONS" | "SECURITY";

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
}) {
  await getPool().execute(
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
