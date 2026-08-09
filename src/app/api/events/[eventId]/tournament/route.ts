import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getTournamentAccess } from "@/lib/tournament-access";

const schema = z.object({
  action: z.enum(["SETTINGS", "PAUSE", "RESUME"]),
  defaultBestOf: z.number().int().optional(),
  noShowMinutes: z.number().int().min(1).max(180).optional(),
  confirmationMinutes: z.number().int().min(1).max(1440).optional(),
  reason: z.string().trim().max(500).optional().default(""),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid tournament settings." }, { status: 400 });
  const { eventId } = await context.params;
  const access = await getTournamentAccess(session.userId, eventId);
  if (!access.event || !access.event.bracket_enabled) return NextResponse.json({ error: "Tournament event not found." }, { status: 404 });
  if (!access.manager) return NextResponse.json({ error: "Tournament manager permission is required." }, { status: 403 });

  const { action } = parsed.data;
  if (action === "SETTINGS") {
    const defaultBestOf = parsed.data.defaultBestOf ?? 1;
    const noShowMinutes = parsed.data.noShowMinutes ?? 15;
    const confirmationMinutes = parsed.data.confirmationMinutes ?? 30;
    if (![1, 3, 5, 7, 9].includes(defaultBestOf)) return NextResponse.json({ error: "Default best-of must be 1, 3, 5, 7, or 9." }, { status: 400 });

    await getPool().execute(
      `INSERT INTO tournament_settings
        (event_id, default_best_of, no_show_minutes, confirmation_minutes, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE default_best_of = VALUES(default_best_of), no_show_minutes = VALUES(no_show_minutes),
         confirmation_minutes = VALUES(confirmation_minutes), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)`,
      [eventId, defaultBestOf, noShowMinutes, confirmationMinutes, session.userId],
    );
    await getPool().execute(
      `UPDATE bracket_matches bm INNER JOIN brackets b ON b.id = bm.bracket_id
       SET bm.best_of = ?, bm.updated_at = CURRENT_TIMESTAMP(3)
       WHERE b.event_id = ? AND bm.status = 'PENDING' AND bm.scheduled_at IS NULL`,
      [defaultBestOf, eventId],
    );
    await writeAuditLog({ actorUserId: session.userId, workspaceId: access.event.workspace_id, eventId, action: "tournament.settings_updated", targetType: "event", targetId: eventId, details: { defaultBestOf, noShowMinutes, confirmationMinutes } });
    return NextResponse.json({ success: true });
  }

  if (action === "PAUSE") {
    if (parsed.data.reason.length < 3) return NextResponse.json({ error: "Enter a short reason for pausing the tournament." }, { status: 400 });
    await getPool().execute(
      `INSERT INTO tournament_settings (event_id, paused_at, paused_by, pause_reason, updated_by)
       VALUES (?, CURRENT_TIMESTAMP(3), ?, ?, ?)
       ON DUPLICATE KEY UPDATE paused_at = CURRENT_TIMESTAMP(3), paused_by = VALUES(paused_by),
         pause_reason = VALUES(pause_reason), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)`,
      [eventId, session.userId, parsed.data.reason, session.userId],
    );
    await writeAuditLog({ actorUserId: session.userId, workspaceId: access.event.workspace_id, eventId, action: "tournament.paused", targetType: "event", targetId: eventId, details: { reason: parsed.data.reason } });
    return NextResponse.json({ success: true, paused: true });
  }

  await getPool().execute(
    `INSERT INTO tournament_settings (event_id, paused_at, paused_by, pause_reason, updated_by)
     VALUES (?, NULL, NULL, NULL, ?)
     ON DUPLICATE KEY UPDATE paused_at = NULL, paused_by = NULL, pause_reason = NULL,
       updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)`,
    [eventId, session.userId],
  );
  await writeAuditLog({ actorUserId: session.userId, workspaceId: access.event.workspace_id, eventId, action: "tournament.resumed", targetType: "event", targetId: eventId });
  return NextResponse.json({ success: true, paused: false });
}
