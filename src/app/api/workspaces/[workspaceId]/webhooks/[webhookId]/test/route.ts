import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { decryptWebhookUrl, sendDiscordWebhook } from "@/lib/webhooks";

type WebhookRow = RowDataPacket & { encrypted_url: string; username_override: string | null; avatar_url: string | null; label: string; workspace_name: string };

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; webhookId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId, webhookId } = await context.params;
  if (!(await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_WEBHOOKS"))) return NextResponse.json({ error: "Webhook-management permission is required." }, { status: 403 });
  const rows = await query<WebhookRow[]>(
    `SELECT wh.encrypted_url, wh.username_override, wh.avatar_url, wh.label, w.name AS workspace_name
     FROM workspace_webhooks wh INNER JOIN workspaces w ON w.id = wh.workspace_id
     WHERE wh.id = ? AND wh.workspace_id = ? LIMIT 1`,
    [webhookId, workspaceId],
  );
  const webhook = rows[0];
  if (!webhook) return NextResponse.json({ error: "Webhook not found." }, { status: 404 });
  try {
    const status = await sendDiscordWebhook(decryptWebhookUrl(webhook.encrypted_url), {
      username: webhook.username_override ?? "Game Night Tools",
      avatarUrl: webhook.avatar_url,
      embed: { title: "Webhook connected", description: `${webhook.label} is ready to post updates for ${webhook.workspace_name}.`, fields: [{ name: "Source", value: "Game Night Tools v0.3.8", inline: true }, { name: "Status", value: "Test successful", inline: true }] },
    });
    await getPool().execute(`UPDATE workspace_webhooks SET failure_count = 0, last_success_at = CURRENT_TIMESTAMP(3), last_error_message = NULL WHERE id = ?`, [webhookId]);
    await getPool().execute(`INSERT INTO webhook_delivery_logs (id, webhook_id, notification_type, status, response_status) VALUES (?, ?, 'TEST', 'SUCCESS', ?)`, [randomUUID(), webhookId, status]);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Webhook test failed.";
    await getPool().execute(`UPDATE workspace_webhooks SET failure_count = failure_count + 1, last_error_at = CURRENT_TIMESTAMP(3), last_error_message = ? WHERE id = ?`, [message, webhookId]);
    await getPool().execute(`INSERT INTO webhook_delivery_logs (id, webhook_id, notification_type, status, error_message) VALUES (?, ?, 'TEST', 'FAILED', ?)`, [randomUUID(), webhookId, message]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
