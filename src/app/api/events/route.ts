import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getWorkspaceRole } from "@/lib/access";
import { hasWorkspacePermission } from "@/lib/permissions";
import { query, withTransaction } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getEventViewerAccess } from "@/lib/event-view-access";

const optionalUrl = z.string().trim().url().max(1000).nullable().optional().or(z.literal(""));
const bracketFormatSchema = z.enum(["SINGLE_ELIMINATION", "THREE_PLAYER", "DOUBLE_ELIMINATION", "ROUND_ROBIN", "GROUPS_PLAYOFFS"]);

const createEventSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  platformName: z.string().trim().max(80).nullable().optional(),
  subgameName: z.string().trim().max(191).nullable().optional(),
  gameUrl: optionalUrl,
  gameExternalId: z.string().trim().max(80).nullable().optional(),
  gameUniverseId: z.string().trim().max(80).nullable().optional(),
  gameThumbnailUrl: optionalUrl,
  requiredConnectionType: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  signupDeadline: z.string().datetime().nullable().optional(),
  checkInOpensAt: z.string().datetime().nullable().optional(),
  checkInDeadline: z.string().datetime().nullable().optional(),
  maxParticipants: z.number().int().min(0).max(10000).nullable().optional(),
  visibility: z.enum(["SERVER", "CODE_ONLY", "UNLISTED", "PUBLIC", "STAFF_ONLY"]).default("SERVER"),
  joinCodeRequired: z.boolean().default(true),
  timezone: z.string().trim().min(2).max(100).default("America/Detroit"),
  bracketEnabled: z.boolean().default(false),
  bracketFormat: bracketFormatSchema.nullable().optional(),
  bracketEntryMode: z.enum(["PLAYER", "TEAM"]).default("PLAYER"),
  bracketSeedingMode: z.enum(["RANDOM", "MANUAL"]).nullable().optional(),
  bracketAutoGenerate: z.boolean().default(false),
  bracketRequireCheckIn: z.boolean().default(false),
  bracketGroupCount: z.number().int().min(2).max(16).default(2),
  bracketAdvancersPerGroup: z.number().int().min(1).max(8).default(1),
  bracketTiebreakMode: z.enum(["HEAD_TO_HEAD_THEN_SEED", "SEED"]).default("HEAD_TO_HEAD_THEN_SEED"),
});

type EventRow = RowDataPacket & {
  id: string; workspace_id: string; workspace_name: string; name: string; game_name: string | null;
  platform_name: string | null; subgame_name: string | null; game_thumbnail_url: string | null;
  status: string; visibility: string; starts_at: Date | null;
};

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  // Limit the candidate set to events related to this viewer, then apply the
  // same event-level authorization used by direct event views. This prevents
  // VIEWER/REFEREE membership from becoming blanket restricted-event access.
  const candidates = await query<EventRow[]>(
    `SELECT DISTINCT e.id, e.workspace_id, w.name AS workspace_name, e.name, e.game_name,
            e.platform_name, e.subgame_name, e.game_thumbnail_url, e.status, e.visibility, e.starts_at
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     LEFT JOIN workspace_members wm ON wm.workspace_id = e.workspace_id AND wm.user_id = ? AND wm.status = 'ACTIVE'
     LEFT JOIN user_guilds ug ON ug.user_id = ? AND ug.guild_id = w.discord_guild_id
     LEFT JOIN event_cohosts ec ON ec.event_id = e.id AND ec.invited_user_id = ? AND ec.status = 'ACCEPTED'
     LEFT JOIN event_participants ep ON ep.event_id = e.id AND ep.user_id = ? AND ep.status NOT IN ('REJECTED', 'WITHDRAWN')
     WHERE e.visibility = 'PUBLIC'
        OR ug.user_id IS NOT NULL
        OR wm.user_id IS NOT NULL
        OR CAST(e.primary_host_id AS CHAR) = ?
        OR ec.invited_user_id IS NOT NULL
        OR ep.user_id IS NOT NULL
     ORDER BY COALESCE(e.starts_at, '9999-12-31') ASC`,
    [session.userId, session.userId, session.userId, session.userId, session.userId],
  );

  const events: EventRow[] = [];
  for (const event of candidates) {
    const access = await getEventViewerAccess(session.userId, event.id);
    if (!access.canView) continue;
    if (event.visibility === "UNLISTED" && !access.manager) continue;
    if (event.visibility === "STAFF_ONLY" && !access.manager) continue;
    if (event.visibility === "CODE_ONLY" && !access.manager && !access.participant) continue;
    events.push(event);
  }
  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event information.", details: parsed.error.flatten() }, { status: 400 });

  const canHost = await hasWorkspacePermission(session.userId, parsed.data.workspaceId, "HOST_EVENTS");
  if (!canHost) return NextResponse.json({ error: "You do not have permission to host events for this server." }, { status: 403 });
  const role = await getWorkspaceRole(session.userId, parsed.data.workspaceId);

  const [workspace] = await query<(RowDataPacket & { approval_required: number })[]>(
    `SELECT default_staff_approval_required AS approval_required FROM workspaces WHERE id = ? LIMIT 1`,
    [parsed.data.workspaceId],
  );
  if (!workspace) return NextResponse.json({ error: "Server profile not found." }, { status: 404 });

  const eventId = randomUUID();
  const canApprove = await hasWorkspacePermission(session.userId, parsed.data.workspaceId, "APPROVE_EVENTS");
  const approvalRequired = Boolean(workspace.approval_required) && !canApprove && role !== "OWNER";
  const maximum = parsed.data.maxParticipants && parsed.data.maxParticipants > 0 ? parsed.data.maxParticipants : null;
  const bracketFormat = parsed.data.bracketEnabled ? parsed.data.bracketFormat ?? "SINGLE_ELIMINATION" : null;
  const seedingMode = parsed.data.bracketEnabled ? parsed.data.bracketSeedingMode ?? "RANDOM" : null;
  const gameName = parsed.data.subgameName || parsed.data.platformName || null;

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO events
        (id, workspace_id, name, description, game_name, platform_name, subgame_name,
         game_url, game_external_id, game_universe_id, game_thumbnail_url, required_connection_type,
         status, visibility, join_code_required, starts_at, signup_deadline,
         check_in_opens_at, check_in_deadline, max_participants, timezone,
         bracket_enabled, bracket_format, bracket_entry_mode, bracket_seeding_mode, bracket_auto_generate,
         bracket_require_check_in, bracket_group_count, bracket_advancers_per_group, bracket_tiebreak_mode,
         staff_approval_required, created_by, primary_host_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId, parsed.data.workspaceId, parsed.data.name, parsed.data.description ?? null, gameName,
        parsed.data.platformName ?? null, parsed.data.subgameName ?? null, parsed.data.gameUrl || null,
        parsed.data.gameExternalId ?? null, parsed.data.gameUniverseId ?? null, parsed.data.gameThumbnailUrl || null,
        parsed.data.requiredConnectionType ?? null, parsed.data.visibility, parsed.data.joinCodeRequired ? 1 : 0,
        parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
        parsed.data.signupDeadline ? new Date(parsed.data.signupDeadline) : null,
        parsed.data.checkInOpensAt ? new Date(parsed.data.checkInOpensAt) : null,
        parsed.data.checkInDeadline ? new Date(parsed.data.checkInDeadline) : null,
        maximum, parsed.data.timezone, parsed.data.bracketEnabled ? 1 : 0, bracketFormat,
        parsed.data.bracketEntryMode, seedingMode, parsed.data.bracketAutoGenerate ? 1 : 0,
        parsed.data.bracketRequireCheckIn ? 1 : 0, parsed.data.bracketGroupCount,
        parsed.data.bracketAdvancersPerGroup, parsed.data.bracketTiebreakMode,
        approvalRequired ? 1 : 0, session.userId, session.userId,
      ],
    );
    if (parsed.data.bracketEnabled && bracketFormat && seedingMode) {
      await connection.execute(
        `INSERT INTO brackets (id, event_id, format, status, seeding_mode) VALUES (?, ?, ?, 'DRAFT', ?)`,
        [randomUUID(), eventId, bracketFormat, seedingMode],
      );
    }
  });

  await writeAuditLog({
    actorUserId: session.userId, workspaceId: parsed.data.workspaceId, eventId,
    action: "event.created", targetType: "event", targetId: eventId,
    details: {
      initialStatus: "DRAFT",
      approvalRequired,
      visibility: parsed.data.visibility,
      platformName: parsed.data.platformName,
      bracketEnabled: parsed.data.bracketEnabled,
      bracketFormat,
      bracketEntryMode: parsed.data.bracketEntryMode,
    },
  });
  return NextResponse.json({ eventId, status: "DRAFT", approvalRequired }, { status: 201 });
}
