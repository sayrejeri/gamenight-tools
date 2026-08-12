import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { EditEventForm } from "@/components/edit-event-form";

type EventRow = RowDataPacket & {
  id: string; workspace_id: string; primary_host_id: string; status: string; name: string; description: string | null;
  platform_name: string | null; subgame_name: string | null; game_url: string | null; game_external_id: string | null;
  game_universe_id: string | null; game_thumbnail_url: string | null; required_connection_type: string | null; starts_at: Date | null;
  signup_deadline: Date | null; check_in_opens_at: Date | null; check_in_deadline: Date | null; max_participants: number | null;
  timezone: string; visibility: string; join_code_required: number; bracket_enabled: number;
  bracket_format: "SINGLE_ELIMINATION" | "THREE_PLAYER" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_PLAYOFFS" | null;
  bracket_entry_mode: "PLAYER" | "TEAM"; bracket_seeding_mode: "RANDOM" | "MANUAL" | null;
  bracket_auto_generate: number; bracket_require_check_in: number; bracket_group_count: number;
  bracket_advancers_per_group: number; bracket_tiebreak_mode: "HEAD_TO_HEAD_THEN_SEED" | "SEED";
};
type PreviewRow = RowDataPacket & {
  workspace_name: string;
  primary_host_name: string;
  cohost_names: string | null;
  player_count: number;
  team_count: number;
};

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(`SELECT * FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = events[0];
  if (!event) notFound();
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_EVENTS") || cohost[0]?.permission_level === "FULL";
  if (!allowed) notFound();

  const previewRows = await query<PreviewRow[]>(
    `SELECT w.name AS workspace_name,
            COALESCE(host.global_name, host.username) AS primary_host_name,
            (SELECT GROUP_CONCAT(COALESCE(cu.global_name, cu.username) ORDER BY ec.created_at SEPARATOR '|||')
             FROM event_cohosts ec INNER JOIN users cu ON cu.id = ec.invited_user_id
             WHERE ec.event_id = e.id AND ec.status = 'ACCEPTED') AS cohost_names,
            (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id AND ep.status = 'APPROVED') AS player_count,
            (SELECT COUNT(*) FROM event_team_entries ete WHERE ete.event_id = e.id AND ete.status = 'REGISTERED') AS team_count
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN users host ON host.id = e.primary_host_id
     WHERE e.id = ? LIMIT 1`,
    [eventId],
  );
  const preview = previewRows[0];

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Event setup</span><h1>Edit {event.name}</h1><p>Changes save to the existing event. Changing competition structure resets the generated competition before it goes live.</p></div><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>
      <section className="panel"><EditEventForm eventId={eventId} preview={{
        status: event.status,
        host: preview?.primary_host_name ?? "Host",
        cohosts: preview?.cohost_names ? preview.cohost_names.split("|||").filter(Boolean) : [],
        playerParticipants: Number(preview?.player_count ?? 0),
        teamParticipants: Number(preview?.team_count ?? 0),
        workspace: preview?.workspace_name ?? "Server",
      }} initial={{
        name: event.name, description: event.description ?? "", platformName: event.platform_name ?? "", subgameName: event.subgame_name ?? "",
        gameUrl: event.game_url ?? "", gameExternalId: event.game_external_id ?? "", gameUniverseId: event.game_universe_id ?? "",
        gameThumbnailUrl: event.game_thumbnail_url ?? "", requiredConnectionType: event.required_connection_type ?? "",
        startsAt: event.starts_at ? new Date(event.starts_at).toISOString() : null,
        signupDeadline: event.signup_deadline ? new Date(event.signup_deadline).toISOString() : null,
        checkInOpensAt: event.check_in_opens_at ? new Date(event.check_in_opens_at).toISOString() : null,
        checkInDeadline: event.check_in_deadline ? new Date(event.check_in_deadline).toISOString() : null,
        maxParticipants: event.max_participants, timezone: event.timezone, visibility: event.visibility,
        joinCodeRequired: Boolean(event.join_code_required), bracketEnabled: Boolean(event.bracket_enabled),
        bracketFormat: event.bracket_format ?? "SINGLE_ELIMINATION", bracketEntryMode: event.bracket_entry_mode ?? "PLAYER",
        bracketSeedingMode: event.bracket_seeding_mode ?? "RANDOM", bracketAutoGenerate: Boolean(event.bracket_auto_generate),
        bracketRequireCheckIn: Boolean(event.bracket_require_check_in), bracketGroupCount: event.bracket_group_count ?? 2,
        bracketAdvancersPerGroup: event.bracket_advancers_per_group ?? 1, bracketTiebreakMode: event.bracket_tiebreak_mode ?? "HEAD_TO_HEAD_THEN_SEED",
      }} /></section>
    </div>
  );
}
