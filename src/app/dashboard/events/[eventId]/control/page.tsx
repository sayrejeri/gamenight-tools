import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTournamentAccess } from "@/lib/tournament-access";
import { ScoreboardTool, TimerTool, SavedPoolQuickPicker } from "@/components/game-night-studio";

type BracketRow = RowDataPacket & { id: string; status: string; format: string };
type MatchRow = RowDataPacket & { id: string; stage_label: string | null; round_number: number; match_number: number; status: string; scheduled_at: Date | null; a_name: string | null; b_name: string | null };

function label(value: string) { return value.replaceAll("_", " "); }

export default async function EventControlPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const access = await getTournamentAccess(session.userId, eventId);
  if (!access.event || !access.event.bracket_enabled || !access.manager) notFound();

  const brackets = await query<BracketRow[]>(`SELECT id, status, format FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]);
  const bracket = brackets[0] ?? null;
  const matches = bracket ? await query<MatchRow[]>(
    `SELECT bm.id, bm.stage_label, bm.round_number, bm.match_number, bm.status, bm.scheduled_at,
            a.display_name AS a_name, b.display_name AS b_name
     FROM bracket_matches bm
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     WHERE bm.bracket_id = ?
     ORDER BY FIELD(bm.status, 'DISPUTED', 'AWAITING_CONFIRMATION', 'LIVE', 'READY', 'PENDING', 'COMPLETED', 'FORFEIT'),
              COALESCE(bm.scheduled_at, '9999-12-31') ASC, bm.round_number ASC, bm.match_number ASC`,
    [bracket.id],
  ) : [];

  const counts = matches.reduce((result, match) => {
    result[match.status] = (result[match.status] ?? 0) + 1;
    return result;
  }, {} as Record<string, number>);
  const attention = matches.filter((match) => ["DISPUTED", "AWAITING_CONFIRMATION", "LIVE", "READY"].includes(match.status)).slice(0, 12);

  return (
    <div className="section-stack live-control-page">
      <section className="page-heading"><div><span className="eyebrow">Host live control</span><h1>{access.event.name} Control Room</h1><p>Keep the event queue, scoreboard, timer, and game/map picks together while Match Center handles official tournament results.</p></div><div className="button-row"><Link className="button" href={`/dashboard/events/${eventId}/matches`}>Match Center</Link><Link className="button button-secondary" href={`/dashboard/events/${eventId}/series`}>Series Desk</Link><Link className="button button-secondary" href={`/dashboard/events/${eventId}/bracket`}>Bracket</Link></div></section>

      <section className="live-control-status-strip"><div><span>Event</span><strong>{label(access.event.status)}</strong></div><div><span>Competition</span><strong>{bracket ? label(bracket.status) : "Not generated"}</strong></div><div><span>Live</span><strong>{counts.LIVE ?? 0}</strong></div><div><span>Awaiting</span><strong>{counts.AWAITING_CONFIRMATION ?? 0}</strong></div><div><span>Disputed</span><strong>{counts.DISPUTED ?? 0}</strong></div><div><span>Completed</span><strong>{(counts.COMPLETED ?? 0) + (counts.FORFEIT ?? 0)}</strong></div></section>

      <div className="live-control-grid"><ScoreboardTool compact /><TimerTool compact /><SavedPoolQuickPicker compact /></div>

      <section className="panel section-stack"><div className="section-heading-row"><div><span className="eyebrow">Needs attention</span><h2>Current matches</h2><p className="muted">Disputes and pending confirmations stay at the top, followed by live and ready matches.</p></div><Link className="button button-secondary" href={`/dashboard/events/${eventId}/matches`}>Open full Match Center</Link></div>{attention.length ? <div className="control-match-grid">{attention.map((match) => <article className={`control-match-card status-${match.status.toLowerCase()}`} key={match.id}><header><span>{match.stage_label ?? `Round ${match.round_number}`} · Match {match.match_number}</span><strong>{label(match.status)}</strong></header><h3>{match.a_name ?? "TBD"} <span>vs</span> {match.b_name ?? "TBD"}</h3><small>{match.scheduled_at ? `Scheduled ${new Date(match.scheduled_at).toLocaleString()}` : "Not scheduled"}</small></article>)}</div> : <div className="empty-state">No live, ready, disputed, or pending-confirmation matches right now.</div>}</section>
    </div>
  );
}
