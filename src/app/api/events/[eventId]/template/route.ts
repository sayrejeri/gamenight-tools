import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { getPool, query } from "@/lib/db";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).nullable().optional(),
  shared: z.boolean().default(true),
});

type EventRow = RowDataPacket & {
  workspace_id: string;
  primary_host_id: string;
  name: string;
  description: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  game_url: string | null;
  game_external_id: string | null;
  game_universe_id: string | null;
  game_thumbnail_url: string | null;
  required_connection_type: string | null;
  max_participants: number | null;
  timezone: string;
  visibility: string;
  join_code_required: number;
  bracket_enabled: number;
  bracket_format: string | null;
  bracket_seeding_mode: string | null;
  bracket_auto_generate: number;
  bracket_require_check_in: number;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid template name." }, { status: 400 });

  const { eventId } = await context.params;
  const events = await query<EventRow[]>(
    `SELECT workspace_id, primary_host_id, name, description, platform_name, subgame_name,
            game_url, game_external_id, game_universe_id, game_thumbnail_url,
            required_connection_type, max_participants, timezone, visibility,
            join_code_required, bracket_enabled, bracket_format, bracket_seeding_mode,
            bracket_auto_generate, bracket_require_check_in
     FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const role = await getWorkspaceRole(session.userId, event.workspace_id);
  if (event.primary_host_id !== session.userId && !canManageCodes(role)) {
    return NextResponse.json({ error: "You cannot create a template from this event." }, { status: 403 });
  }

  const configuration = {
    name: event.name,
    platformName: event.platform_name ?? "",
    subgameName: event.subgame_name ?? "",
    gameUrl: event.game_url ?? "",
    gameExternalId: event.game_external_id ?? "",
    gameUniverseId: event.game_universe_id ?? "",
    gameThumbnailUrl: event.game_thumbnail_url ?? "",
    requiredConnectionType: event.required_connection_type ?? "",
    description: event.description ?? "",
    maxParticipants: event.max_participants === null ? "0" : String(event.max_participants),
    timezone: event.timezone,
    visibility: event.visibility,
    joinCodeRequired: Boolean(event.join_code_required),
    bracketEnabled: Boolean(event.bracket_enabled),
    bracketFormat: event.bracket_format ?? "SINGLE_ELIMINATION",
    bracketSeedingMode: event.bracket_seeding_mode ?? "RANDOM",
    bracketAutoGenerate: Boolean(event.bracket_auto_generate),
    bracketRequireCheckIn: Boolean(event.bracket_require_check_in),
  };

  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO event_templates
      (id, workspace_id, name, description, platform_name, subgame_name, game_url,
       game_external_id, game_universe_id, game_thumbnail_url, configuration_json,
       is_shared, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      event.workspace_id,
      parsed.data.name,
      parsed.data.description ?? null,
      event.platform_name,
      event.subgame_name,
      event.game_url,
      event.game_external_id,
      event.game_universe_id,
      event.game_thumbnail_url,
      JSON.stringify(configuration),
      parsed.data.shared ? 1 : 0,
      session.userId,
    ],
  );

  return NextResponse.json({ id }, { status: 201 });
}
