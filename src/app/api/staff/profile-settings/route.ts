import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { getPlatformRole } from "@/lib/platform-access";
import { SERVER_PROFILE_APPROVAL_SETTING } from "@/lib/platform-settings";
import { writeAuditLog } from "@/lib/audit";

const settingsSchema = z.object({ serverProfileApprovalRequired: z.boolean() });

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const role = await getPlatformRole(session.userId);
  if (role !== "OWNER") return NextResponse.json({ error: "Platform Owner access is required." }, { status: 403 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile approval setting." }, { status: 400 });

  const value = parsed.data.serverProfileApprovalRequired ? "1" : "0";
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3)`,
      [SERVER_PROFILE_APPROVAL_SETTING, value, session.userId, value, session.userId],
    );
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "platform.server_profile_approval_policy.updated",
    targetType: "platform_setting",
    targetId: SERVER_PROFILE_APPROVAL_SETTING,
    details: { serverProfileApprovalRequired: parsed.data.serverProfileApprovalRequired },
  });
  return NextResponse.json({ success: true });
}
