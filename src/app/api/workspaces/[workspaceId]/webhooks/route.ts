import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getWorkspaceRole } from "@/lib/access";
import { getPool } from "@/lib/db";
import { encryptWebhookUrl, isDiscordWebhookUrl, webhookUrlHint } from "@/lib/webhooks";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  label: z.string().trim().min(2).max(100),
  url: z.string().trim().url().max(1000),
  notificationTypes: z.array(z.enum(["EVENT_PUBLISHED", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "EVENT_LIVE", "EVENT_COMPLETED", "EVENT_CANCELLED", "BRACKET_PUBLISHED", "SUGGESTION_UPDATE"])).max(20),
  usernameOverride: z.string().trim().max(80).optional().default(""),
  avatarUrl: z.string().url().max(1000).or(z.literal("")).optional().default(""),
});

function canManage(role: string | null): boolean { return role === "OWNER" || role === "ADMIN"; }

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const role = await getWorkspaceRole(session.userId, workspaceId);
  if (!canManage(role)) return NextResponse.json({ error: "Server owner or admin access is required." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isDiscordWebhookUrl(parsed.data.url)) return NextResponse.json({ error: "Enter a valid Discord webhook URL and label." }, { status: 400 });
  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO workspace_webhooks
      (id, workspace_id, label, encrypted_url, url_hint, notification_types_json,
       username_override, avatar_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, parsed.data.label, encryptWebhookUrl(parsed.data.url), webhookUrlHint(parsed.data.url), JSON.stringify(parsed.data.notificationTypes), parsed.data.usernameOverride || null, parsed.data.avatarUrl || null, session.userId],
  );
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "webhook.created", targetType: "webhook", targetId: id, details: { label: parsed.data.label, notificationTypes: parsed.data.notificationTypes } });
  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  const role = await getWorkspaceRole(session.userId, workspaceId);
  if (!canManage(role)) return NextResponse.json({ error: "Server owner or admin access is required." }, { status: 403 });
  const webhookId = new URL(request.url).searchParams.get("webhookId");
  if (!webhookId) return NextResponse.json({ error: "Webhook ID is required." }, { status: 400 });
  await getPool().execute(`DELETE FROM workspace_webhooks WHERE id = ? AND workspace_id = ?`, [webhookId, workspaceId]);
  await writeAuditLog({ actorUserId: session.userId, workspaceId, action: "webhook.deleted", targetType: "webhook", targetId: webhookId });
  return NextResponse.json({ success: true });
}
