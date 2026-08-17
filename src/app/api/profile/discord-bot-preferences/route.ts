import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { withTransaction } from "@/lib/db";

const schema = z.object({
  dmRemindersEnabled: z.boolean(),
  signupReminders: z.boolean(),
  checkinReminders: z.boolean(),
  matchReminders: z.boolean(),
  resultReminders: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the Discord reminder settings." }, { status: 400 });

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO user_discord_bot_preferences
        (user_id, dm_reminders_enabled, signup_reminders, checkin_reminders, match_reminders, result_reminders)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         dm_reminders_enabled = VALUES(dm_reminders_enabled),
         signup_reminders = VALUES(signup_reminders),
         checkin_reminders = VALUES(checkin_reminders),
         match_reminders = VALUES(match_reminders),
         result_reminders = VALUES(result_reminders),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [
        session.userId,
        parsed.data.dmRemindersEnabled ? 1 : 0,
        parsed.data.signupReminders ? 1 : 0,
        parsed.data.checkinReminders ? 1 : 0,
        parsed.data.matchReminders ? 1 : 0,
        parsed.data.resultReminders ? 1 : 0,
      ],
    );
    await writeAuditLog({
      actorUserId: session.userId,
      action: "profile.discord_bot_preferences.update",
      targetType: "USER",
      targetId: session.userId,
      details: parsed.data,
    }, connection);
  });

  return NextResponse.json({ success: true });
}
