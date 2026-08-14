import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { withTransaction } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";

const snowflake = z.string().trim().regex(/^\d{15,25}$/).or(z.literal(""));
const schema = z.object({
  dmRemindersEnabled: z.boolean(),
  announcementsEnabled: z.boolean(),
  temporaryMatchChannelsEnabled: z.boolean(),
  roleSyncEnabled: z.boolean(),
  announcementChannelId: snowflake,
  matchCategoryId: snowflake,
  competitorRoleId: snowflake,
  championRoleId: snowflake,
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { workspaceId } = await context.params;
  if (!await hasWorkspacePermission(session.userId, workspaceId, "MANAGE_SERVER_PROFILE")) {
    return NextResponse.json({ error: "Manage Server Profile permission is required." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the bot feature settings and Discord IDs." }, { status: 400 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO workspace_bot_settings
        (workspace_id, dm_reminders_enabled, announcements_enabled, temporary_match_channels_enabled, role_sync_enabled,
         announcement_channel_id, match_category_id, competitor_role_id, champion_role_id, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         dm_reminders_enabled = VALUES(dm_reminders_enabled),
         announcements_enabled = VALUES(announcements_enabled),
         temporary_match_channels_enabled = VALUES(temporary_match_channels_enabled),
         role_sync_enabled = VALUES(role_sync_enabled),
         announcement_channel_id = VALUES(announcement_channel_id),
         match_category_id = VALUES(match_category_id),
         competitor_role_id = VALUES(competitor_role_id),
         champion_role_id = VALUES(champion_role_id),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [
        workspaceId,
        parsed.data.dmRemindersEnabled ? 1 : 0,
        parsed.data.announcementsEnabled ? 1 : 0,
        parsed.data.temporaryMatchChannelsEnabled ? 1 : 0,
        parsed.data.roleSyncEnabled ? 1 : 0,
        parsed.data.announcementChannelId || null,
        parsed.data.matchCategoryId || null,
        parsed.data.competitorRoleId || null,
        parsed.data.championRoleId || null,
        session.userId,
      ],
    );
    await writeAuditLog({
      actorUserId: session.userId,
      action: "workspace.bot.settings.update",
      workspaceId,
      targetType: "WORKSPACE",
      targetId: workspaceId,
      details: parsed.data,
      severity: parsed.data.temporaryMatchChannelsEnabled || parsed.data.roleSyncEnabled ? "PERMISSIONS" : "INFO",
    }, connection);
  });

  return NextResponse.json({ success: true });
}
