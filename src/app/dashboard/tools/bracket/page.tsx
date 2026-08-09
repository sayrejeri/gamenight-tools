import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { BracketGenerator, type BracketStatus, type DatabaseBracketFormat } from "@/components/bracket-generator";
import type { Participant, TieBreakMode } from "@/components/bracket/bracket-model";

type EventRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  name: string;
  primary_host_id: string;
  bracket_enabled: number;
  bracket_format: DatabaseBracketFormat | null;
  bracket_entry_mode: "PLAYER" | "TEAM";
  bracket_seeding_mode: "RANDOM" | "MANUAL" | null;
  bracket_require_check_in: number;
  bracket_group_count: number;
  bracket_advancers_per_group: number;
  bracket_tiebreak_mode: TieBreakMode;
};
type ParticipantRow = RowDataPacket & { user_id: string; display_name: string };
type TeamRow = RowDataPacket & { team_id: string; display_name: string; roster_json: string | null };
type BracketRow = RowDataPacket & { settings_json: string | null; status: BracketStatus; updated_at: Date };

function parseRoster(value: string | null): Participant["roster"] {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const item = member as { userId?: unknown; name?: unknown; role?: unknown };
      if (typeof item.userId !== "string" || typeof item.name !== "string") return [];
      return [{ userId: item.userId, name: item.name, role: typeof item.role === "string" ? item.role : undefined }];
    });
  } catch { return undefined; }
}

export default async function BracketToolPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const session = await requireSession();
  const { eventId } = await searchParams;
  let initialTitle = "Game Night Tournament";
  let initialParticipants: Participant[] = [];
  let initialDraft: unknown = null;
  let initialStatus: BracketStatus = "DRAFT";
  let initialUpdatedAt: string | null = null;
  let initialConfiguredFormat: DatabaseBracketFormat = "SINGLE_ELIMINATION";
  let initialEntrantMode: "PLAYER" | "TEAM" = "PLAYER";
  let initialGroupCount = 2;
  let initialAdvancersPerGroup = 1;
  let initialTieBreakMode: TieBreakMode = "HEAD_TO_HEAD_THEN_SEED";
  let initialSeedingMode: "RANDOM" | "MANUAL" = "RANDOM";
  let eventName: string | null = null;
  let accessError: string | null = null;

  if (eventId) {
    const events = await query<EventRow[]>(
      `SELECT id, workspace_id, name, CAST(primary_host_id AS CHAR) AS primary_host_id, bracket_enabled,
              bracket_format, bracket_entry_mode, bracket_seeding_mode, bracket_require_check_in,
              bracket_group_count, bracket_advancers_per_group, bracket_tiebreak_mode
       FROM events WHERE id = ? LIMIT 1`,
      [eventId],
    );
    const event = events[0];
    if (!event) accessError = "That event could not be found.";
    else if (!event.bracket_enabled) accessError = "Tournament competition tools are not enabled for this event.";
    else {
      const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
        `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' AND permission_level IN ('FULL', 'BRACKET') LIMIT 1`, [eventId, session.userId],
      );
      const allowed = event.primary_host_id === session.userId || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_BRACKETS") || Boolean(cohost[0]);
      if (!allowed) accessError = "You need bracket-manager permission for this event.";
      else {
        eventName = event.name;
        initialTitle = event.name;
        initialConfiguredFormat = event.bracket_format ?? "SINGLE_ELIMINATION";
        initialEntrantMode = event.bracket_entry_mode ?? "PLAYER";
        initialGroupCount = event.bracket_group_count ?? 2;
        initialAdvancersPerGroup = event.bracket_advancers_per_group ?? 1;
        initialTieBreakMode = event.bracket_tiebreak_mode ?? "HEAD_TO_HEAD_THEN_SEED";
        initialSeedingMode = event.bracket_seeding_mode ?? "RANDOM";

        if (initialEntrantMode === "TEAM") {
          const teams = await query<TeamRow[]>(
            `SELECT ete.team_id, t.name AS display_name, ete.roster_json
             FROM event_team_entries ete INNER JOIN teams t ON t.id = ete.team_id
             WHERE ete.event_id = ? AND ete.status = 'REGISTERED'
             ORDER BY COALESCE(ete.seed_number, 2147483647), ete.registered_at ASC`,
            [eventId],
          );
          initialParticipants = teams.map((team) => ({
            id: `team-${team.team_id}`,
            name: team.display_name,
            entrantType: "team",
            teamId: team.team_id,
            roster: parseRoster(team.roster_json),
          }));
        } else {
          const participants = await query<ParticipantRow[]>(
            `SELECT CAST(ep.user_id AS CHAR) AS user_id, COALESCE(NULLIF(ep.game_identity_value, ''), u.global_name, u.username) AS display_name
             FROM event_participants ep INNER JOIN users u ON u.id = ep.user_id
             WHERE ep.event_id = ? AND ep.status = 'APPROVED' AND (? = 0 OR ep.checked_in_at IS NOT NULL) ORDER BY ep.joined_at ASC`,
            [eventId, event.bracket_require_check_in ? 1 : 0],
          );
          initialParticipants = participants.map((participant) => ({ id: `user-${participant.user_id}`, name: participant.display_name, entrantType: "player" }));
        }

        const brackets = await query<BracketRow[]>(`SELECT settings_json, status, updated_at FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]);
        if (brackets[0]?.settings_json) {
          try { initialDraft = JSON.parse(brackets[0].settings_json); } catch { initialDraft = null; }
        }
        initialStatus = brackets[0]?.status ?? "DRAFT";
        initialUpdatedAt = brackets[0]?.updated_at ? new Date(brackets[0].updated_at).toISOString() : null;
      }
    }
  }

  if (accessError) return <section className="panel section-stack"><h1>Competition unavailable</h1><p className="muted">{accessError}</p><Link className="button button-secondary" href="/dashboard">Return to dashboard</Link></section>;
  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">{eventName ? "Shared event competition" : "Standalone tool"}</span><h1>Competition generator</h1><p>Build single elimination, double elimination, round robin, groups-to-playoffs, or the custom three-player format. Live results run through Match Center.</p></div>
        {eventId ? <div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link>{initialEntrantMode === "TEAM" ? <Link className="button button-secondary" href={`/dashboard/events/${eventId}/teams`}>Tournament teams</Link> : null}<Link className="button button-secondary" href={`/dashboard/events/${eventId}/bracket`}>View competition</Link><Link className="button button-secondary" href={`/dashboard/events/${eventId}/matches`}>Match Center</Link></div> : null}
      </section>
      {eventId && initialParticipants.length === 0 ? <div className="error-banner">No eligible {initialEntrantMode === "TEAM" ? "teams are registered" : "participants are ready"} yet. {initialEntrantMode === "TEAM" ? "Register tournament teams, then return here." : "Approve signups and complete any required check-in, then return here."}</div> : null}
      <BracketGenerator
        eventId={eventId}
        initialTitle={initialTitle}
        initialParticipants={initialParticipants}
        initialDraft={initialDraft}
        initialStatus={initialStatus}
        initialUpdatedAt={initialUpdatedAt}
        initialConfiguredFormat={initialConfiguredFormat}
        initialEntrantMode={initialEntrantMode}
        initialGroupCount={initialGroupCount}
        initialAdvancersPerGroup={initialAdvancersPerGroup}
        initialTieBreakMode={initialTieBreakMode}
        initialSeedingMode={initialSeedingMode}
      />
    </div>
  );
}
