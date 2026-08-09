import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { getPool, query } from "@/lib/db";
import { decryptWebhookUrl, sendDiscordWebhook } from "@/lib/webhooks";

type WebhookRow = RowDataPacket & {
  id: string;
  encrypted_url: string;
  notification_types_json: string | null;
  username_override: string | null;
  avatar_url: string | null;
};

export type WorkspaceWebhookNotification =
  | "EVENT_PUBLISHED"
  | "SIGNUPS_CLOSED"
  | "CHECK_IN_OPEN"
  | "EVENT_LIVE"
  | "EVENT_COMPLETED"
  | "EVENT_CANCELLED"
  | "BRACKET_PUBLISHED"
  | "MATCH_UPDATE"
  | "SUGGESTION_UPDATE"
  | "COMMUNITY_ANNOUNCEMENT";

export async function dispatchWorkspaceWebhooks(input: {
  workspaceId: string;
  eventId?: string | null;
  notificationType: WorkspaceWebhookNotification;
  title: string;
  description: string;
  url?: string | null;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}) {
  const rows = await query<WebhookRow[]>(
    `SELECT id, encrypted_url, notification_types_json, username_override, avatar_url
     FROM workspace_webhooks WHERE workspace_id = ? AND is_active = 1`,
    [input.workspaceId],
  );
  const targets = rows.filter((row) => {
    try { return (JSON.parse(row.notification_types_json ?? "[]") as string[]).includes(input.notificationType); }
    catch { return false; }
  });

  await Promise.allSettled(targets.map(async (webhook) => {
    try {
      const status = await sendDiscordWebhook(decryptWebhookUrl(webhook.encrypted_url), {
        username: webhook.username_override ?? "Game Night Tools",
        avatarUrl: webhook.avatar_url,
        embed: { title: input.title, description: input.description, url: input.url ?? undefined, fields: input.fields },
      });
      await getPool().execute(
        `UPDATE workspace_webhooks SET failure_count = 0, last_success_at = CURRENT_TIMESTAMP(3), last_error_message = NULL WHERE id = ?`,
        [webhook.id],
      );
      await getPool().execute(
        `INSERT INTO webhook_delivery_logs (id, webhook_id, event_id, notification_type, status, response_status)
         VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
        [randomUUID(), webhook.id, input.eventId ?? null, input.notificationType, status],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed.";
      await getPool().execute(
        `UPDATE workspace_webhooks SET failure_count = failure_count + 1, last_error_at = CURRENT_TIMESTAMP(3),
           last_error_message = ?, is_active = IF(failure_count + 1 >= 5, 0, is_active) WHERE id = ?`,
        [message, webhook.id],
      );
      await getPool().execute(
        `INSERT INTO webhook_delivery_logs (id, webhook_id, event_id, notification_type, status, error_message)
         VALUES (?, ?, ?, ?, 'FAILED', ?)`,
        [randomUUID(), webhook.id, input.eventId ?? null, input.notificationType, message],
      );
    }
  }));
}
