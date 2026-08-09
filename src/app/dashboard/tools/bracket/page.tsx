import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { BracketGenerator, type BracketStatus } from "@/components/bracket-generator";
import type { Participant } from "@/components/bracket/bracket-model";

type EventRow = RowDataPacket & { id: string; workspace_id: string; name: string; primary_host_id: string; bracket_enabled: number; bracket_require_check_in: number };
type ParticipantRow = RowDataPacket & { user_id: string; display_name: string };
type BracketRow = RowDataPacket & { settings_json: string | null; status: BracketStatus };

export default async function BracketToolPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const session = await requireSession();
  const { eventId } = await searchParams;
  let initialTitle = "Game Night Tournament";
  let initialParticipants: Participant[] = [];
  let initialDraft: unknown = null;
  let initialStatus: BracketStatus = "DRAFT";
  let eventName: string | null = null;
  let accessError: string | null = null;

  if (eventId) {
    const events = await query<EventRow[]>(`SELECT id, workspace_id, name, primary_host_id, bracket_enabled, bracket_require_check_in FROM events WHERE id = ? LIMIT 1`, [eventId]);
    const event = events[0];
    if (!event) accessError = "That event could not be found.";
    else if (!event.bracket_enabled) accessError = "The bracket tool is not enabled for this event.";
    else {
      const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
        `SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' AND permission_level IN ('FULL', 'BRACKET') LIMIT 1`, [eventId, session.userId],
      );
      const allowed = event.primary_host_id === session.userId || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_BRACKETS") || Boolean(cohost[0]);
      if (!allowed) accessError = "You need bracket-manager permission for this event.";
      else {
        eventName = event.name;
        initialTitle = event.name;
        const participants = await query<ParticipantRow[]>(
          `SELECT CAST(ep.user_id AS CHAR) AS user_id, COALESCE(NULLIF(ep.game_identity_value, ''), u.global_name, u.username) AS display_name
           FROM event_participants ep INNER JOIN users u ON u.id = ep.user_id
           WHERE ep.event_id = ? AND ep.status = 'APPROVED' AND (? = 0 OR ep.checked_in_at IS NOT NULL) ORDER BY ep.joined_at ASC`,
          [eventId, event.bracket_require_check_in ? 1 : 0],
        );
        initialParticipants = participants.map((participant) => ({ id: `user-${participant.user_id}`, name: participant.display_name }));
        const brackets = await query<BracketRow[]>(`SELECT settings_json, status FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]);
        if (brackets[0]?.settings_json) {
          try { initialDraft = JSON.parse(brackets[0].settings_json); } catch { initialDraft = null; }
        }
        initialStatus = brackets[0]?.status ?? "DRAFT";
      }
    }
  }

  if (accessError) return <section className="panel section-stack"><h1>Bracket unavailable</h1><p className="muted">{accessError}</p><Link className="button button-secondary" href="/dashboard">Return to dashboard</Link></section>;
  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">{eventName ? "Shared event bracket" : "Standalone tool"}</span><h1>Bracket generator</h1><p>Create a single-elimination or custom three-player bracket, choose winners as matches finish, publish event brackets live, and export the result as a PNG.</p></div>
        {eventId ? <div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link><Link className="button button-secondary" href={`/dashboard/events/${eventId}/bracket`}>View bracket</Link></div> : null}
      </section>
      {eventId && initialParticipants.length === 0 ? <div className="error-banner">No eligible participants are ready yet. Approve signups{eventName ? " and complete any required check-in" : ""}, then return here.</div> : null}
      <BracketGenerator eventId={eventId} initialTitle={initialTitle} initialParticipants={initialParticipants} initialDraft={initialDraft} initialStatus={initialStatus} />
    </div>
  );
}
