import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canHost, getWorkspaceRole } from "@/lib/access";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const createEventSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  gameName: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  signupDeadline: z.string().datetime().nullable().optional(),
  maxParticipants: z.number().int().min(2).max(10000).nullable().optional(),
  visibility: z.enum(["SERVER", "CODE_ONLY", "UNLISTED", "PUBLIC", "STAFF_ONLY"]).default("SERVER"),
  joinCodeRequired: z.boolean().default(true),
  timezone: z.string().trim().min(2).max(100).default("America/Detroit"),
});

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  workspace_name: string;
  name: string;
  game_name: string | null;
  status: string;
  visibility: string;
  starts_at: Date | null;
};

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, w.name AS workspace_name, e.name, e.game_name,
            e.status, e.visibility, e.starts_at
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = e.workspace_id AND wm.user_id = ? AND wm.status = 'ACTIVE'
     LEFT JOIN user_guilds ug
       ON ug.user_id = ? AND ug.guild_id = w.discord_guild_id
     WHERE e.visibility = 'PUBLIC'
        OR wm.user_id IS NOT NULL
        OR (ug.user_id IS NOT NULL AND e.visibility = 'SERVER')
     ORDER BY COALESCE(e.starts_at, '9999-12-31') ASC`,
    [session.userId, session.userId],
  );

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = createEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event information.", details: parsed.error.flatten() }, { status: 400 });
  }

  const role = await getWorkspaceRole(session.userId, parsed.data.workspaceId);
  if (!canHost(role)) {
    return NextResponse.json({ error: "You must be staff or an approved host for this server." }, { status: 403 });
  }

  const [workspace] = await query<(RowDataPacket & { approval_required: number })[]>(
    `SELECT default_staff_approval_required AS approval_required FROM workspaces WHERE id = ? LIMIT 1`,
    [parsed.data.workspaceId],
  );

  const approvalRequired = role === "HOST" && Boolean(workspace?.approval_required);
  const eventId = randomUUID();
  const initialStatus = approvalRequired ? "AWAITING_APPROVAL" : "DRAFT";

  await getPool().execute(
    `INSERT INTO events
      (id, workspace_id, name, description, game_name, status, visibility, join_code_required,
       starts_at, signup_deadline, max_participants, timezone, staff_approval_required,
       created_by, primary_host_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      parsed.data.workspaceId,
      parsed.data.name,
      parsed.data.description ?? null,
      parsed.data.gameName ?? null,
      initialStatus,
      parsed.data.visibility,
      parsed.data.joinCodeRequired ? 1 : 0,
      parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      parsed.data.signupDeadline ? new Date(parsed.data.signupDeadline) : null,
      parsed.data.maxParticipants ?? null,
      parsed.data.timezone,
      approvalRequired ? 1 : 0,
      session.userId,
      session.userId,
    ],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: parsed.data.workspaceId,
    eventId,
    action: "event.created",
    targetType: "event",
    targetId: eventId,
    details: { initialStatus, visibility: parsed.data.visibility },
  });

  return NextResponse.json({ eventId, status: initialStatus }, { status: 201 });
}
