import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { encryptWebhookUrl, isDiscordWebhookUrl, webhookUrlHint } from "@/lib/webhooks";
import { writeAuditLog } from "@/lib/audit";

const notificationType = z.enum(["EVENT_PUBLISHED", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "EVENT_LIVE", "EVENT_COMPLETED", "EVENT_CANCELLED", "BRACKET_PUBLISHED", "SUGGESTION_UPDATE"]);
const baseSchema = z.object({
  label: z.string().trim().min(2).max(100),
  notificationTypes: z.array(notificationType).max(20),
  usernameOverride: z.string().trim().max(80).optional().default(""),
  avatarUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
});
const createSchema = baseSchema.extend({ url: z.string().trim().url().max(1000) });
const updateSchema = baseSchema.extend({
  id: z.string().uuid(),
  url: z.string().trim().url().max(1000).or(z.literal("")).optional().default(""),
  isActive: z.boolean(),
});

async function canManage(userId: string, workspaceId: string): Promise<boolean> {
  return hasWorkspacePermission(userId, workspaceId, "MANAGE_WEBHOOKS");
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!(await canManage(session.userId, workspaceId))) return NextResponse.json({ error: "Webhook-management permission is required." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isDiscordWebhookUrl(parsed.data.url)) return NextResponse.json({ error: "Enter a valid Discord webhook URL and label." }, { status: 400 });
  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO workspace_webhooks
      (id, workspace_id, label, encrypted_url, url_hint, notification_types_json, username_override, avatar_url, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, workspaceId, parsed.data.label, encryptWebhookUrl(parsed.data.url), webhookUrlHint(parsed.data.url), JSON.stringify(parsed.data.notificationTypes), parsed.data.usernameOverride || null, parsed.data.avatarUrl || null, session.userId],
  );
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "webhook.created", targetType: "webhook", targetId: id, severity: "SECURITY", sensitive: true, details: { label: parsed.data.label, notificationTypes: parsed.data.notificationTypes } });
  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!(await canManage(session.userId, workspaceId))) return NextResponse.json({ error: "Webhook-management permission is required." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook update." }, { status: 400 });
  if (parsed.data.url && !isDiscordWebhookUrl(parsed.data.url)) return NextResponse.json({ error: "The replacement URL must be a valid Discord webhook URL." }, { status: 400 });

  if (parsed.data.url) {
    await getPool().execute(
      `UPDATE workspace_webhooks
       SET label = ?, encrypted_url = ?, url_hint = ?, notification_types_json = ?, username_override = ?, avatar_url = ?, is_active = ?,
           failure_count = 0, last_error_message = NULL, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND workspace_id = ?`,
      [parsed.data.label, encryptWebhookUrl(parsed.data.url), webhookUrlHint(parsed.data.url), JSON.stringify(parsed.data.notificationTypes), parsed.data.usernameOverride || null, parsed.data.avatarUrl || null, parsed.data.isActive ? 1 : 0, parsed.data.id, workspaceId],
    );
  } else {
    await getPool().execute(
      `UPDATE workspace_webhooks
       SET label = ?, notification_types_json = ?, username_override = ?, avatar_url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND workspace_id = ?`,
      [parsed.data.label, JSON.stringify(parsed.data.notificationTypes), parsed.data.usernameOverride || null, parsed.data.avatarUrl || null, parsed.data.isActive ? 1 : 0, parsed.data.id, workspaceId],
    );
  }
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "webhook.updated", targetType: "webhook", targetId: parsed.data.id, severity: parsed.data.url ? "SECURITY" : "INFO", sensitive: Boolean(parsed.data.url), details: { label: parsed.data.label, notificationTypes: parsed.data.notificationTypes, active: parsed.data.isActive, urlReplaced: Boolean(parsed.data.url) } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!(await canManage(session.userId, workspaceId))) return NextResponse.json({ error: "Webhook-management permission is required." }, { status: 403 });
  const webhookId = new URL(request.url).searchParams.get("webhookId");
  if (!webhookId) return NextResponse.json({ error: "Webhook ID is required." }, { status: 400 });
  await getPool().execute(`DELETE FROM workspace_webhooks WHERE id = ? AND workspace_id = ?`, [webhookId, workspaceId]);
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "webhook.deleted", targetType: "webhook", targetId: webhookId, severity: "SECURITY", sensitive: true });
  return NextResponse.json({ success: true });
}
