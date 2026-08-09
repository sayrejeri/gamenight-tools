import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";
import { getTournamentAccess } from "@/lib/tournament-access";
import { MatchCenter, type MatchCenterMatch } from "@/components/match-center";

type EventRow = RowDataPacket & {
  id: string; workspace_id: string; workspace_name: string; name: string; primary_host_id: string;
  status: string; visibility: string; bracket_enabled: number; bracket_entry_mode: "PLAYER" | "TEAM"; user_in_guild: number;
};
type BracketRow = RowDataPacket & { id: string; status: string };
type SettingsRow = RowDataPacket & { default_best_of: number; no_show_minutes: number; confirmation_minutes: number; paused_at: Date | null; pause_reason: string | null };
type MatchRow = RowDataPacket & {
  id: string; round_number: number; match_number: number; stage_label: string | null; group_key: string | null; bracket_side: string | null;
  status: string; scheduled_at: Date | null; no_show_deadline_at: Date | null; best_of: number; ready_a_at: Date | null; ready_b_at: Date | null; winner_entry_id: string | null;
  a_entry_id: string | null; a_user_id: string | null; a_team_id: string | null; a_name: string | null; a_roster_json: string | null;
  b_entry_id: string | null; b_user_id: string | null; b_team_id: string | null; b_name: string | null; b_roster_json: string | null;
  report_id: string | null; report_winner_entry_id: string | null; score_a: number | null; score_b: number | null; proof_url: string | null;
  report_notes: string | null; report_status: string | null; report_submitted_by: string | null; report_submitted_at: Date | null;
  dispute_id: string | null; dispute_reason: string | null; dispute_proof_url: string | null; dispute_opened_by: string | null; dispute_created_at: Date | null;
};
type CareerMatchRow = RowDataPacket & { winner_user_id: string | null; a_user_id: string | null; b_user_id: string | null; completed_at: Date | null; updated_at: Date };
type ChampionRow = RowDataPacket & { total: number };
type RosterMember = { userId: string; name: string; role?: string };

function iso(value: Date | null): string | null { return value ? new Date(value).toISOString() : null; }
function parseRoster(value: string | null): RosterMember[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const item = member as { userId?: unknown; name?: unknown; role?: unknown };
      if (typeof item.userId !== "string" || typeof item.name !== "string") return [];
      return [{ userId: item.userId, name: item.name, role: typeof item.role === "string" ? item.role : undefined }];
    });
  } catch { return []; }
}
function sideContains(userId: string, directUserId: string | null, roster: RosterMember[]): boolean {
  return directUserId === userId || roster.some((member) => member.userId === userId);
}

export default async function EventMatchesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, w.name AS workspace_name, e.name, CAST(e.primary_host_id AS CHAR) AS primary_host_id,
            e.status, e.visibility, e.bracket_enabled, e.bracket_entry_mode,
            EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id) AS user_in_guild
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = ? LIMIT 1`,
    [session.userId, eventId],
  );
  const event = events[0];
  if (!event || !event.bracket_enabled) notFound();

  const [workspaceAccess, cohostRows, participantRows, teamRows, tournamentAccess, bracketRows] = await Promise.all([
    getWorkspacePermissionSnapshot(session.userId, event.workspace_id),
    query<(RowDataPacket & { permission_level: string })[]>(`SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId]),
    query<(RowDataPacket & { status: string })[]>(`SELECT status FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1`, [eventId, session.userId]),
    event.bracket_entry_mode === "TEAM" ? query<(RowDataPacket & { roster_json: string | null })[]>(`SELECT roster_json FROM event_team_entries WHERE event_id = ? AND status = 'REGISTERED'`, [eventId]) : Promise.resolve([] as (RowDataPacket & { roster_json: string | null })[]),
    getTournamentAccess(session.userId, eventId),
    query<BracketRow[]>(`SELECT id, status FROM brackets WHERE event_id = ? LIMIT 1`, [eventId]),
  ]);
  const onRegisteredTeam = teamRows.some((row) => parseRoster(row.roster_json).some((member) => member.userId === session.userId));

  const eventPermissions = workspaceAccess.permissions;
  const isEventManager = event.primary_host_id === session.userId
    || ["HOST_EVENTS", "MANAGE_EVENTS", "APPROVE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS"].some((permission) => eventPermissions.includes(permission as typeof eventPermissions[number]))
    || Boolean(cohostRows[0]);
  const restrictedStatus = event.status === "DRAFT" || event.status === "AWAITING_APPROVAL";
  const canViewEvent = restrictedStatus
    ? isEventManager
    : event.visibility === "PUBLIC"
      || event.visibility === "UNLISTED"
      || (event.visibility === "SERVER" && Boolean(event.user_in_guild))
      || isEventManager
      || Boolean(participantRows[0])
      || onRegisteredTeam;
  if (!canViewEvent) notFound();

  const bracket = bracketRows[0];
  if (!bracket) return <section className="panel section-stack"><h1>Match Center unavailable</h1><p className="muted">Generate and save the event competition first.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;
  if (!tournamentAccess.manager && !["LIVE", "COMPLETED"].includes(bracket.status)) return <section className="panel section-stack"><h1>Match Center not live yet</h1><p className="muted">The host is still preparing the tournament.</p><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>;

  const [settingsRows, matchRows, careerRows, championRows] = await Promise.all([
    query<SettingsRow[]>(`SELECT default_best_of, no_show_minutes, confirmation_minutes, paused_at, pause_reason FROM tournament_settings WHERE event_id = ? LIMIT 1`, [eventId]),
    query<MatchRow[]>(
      `SELECT bm.id, bm.round_number, bm.match_number, bm.stage_label, bm.group_key, bm.bracket_side,
              bm.status, bm.scheduled_at, bm.no_show_deadline_at, bm.best_of, bm.ready_a_at, bm.ready_b_at, bm.winner_entry_id,
              a.id AS a_entry_id, CAST(a.user_id AS CHAR) AS a_user_id, a.team_id AS a_team_id, a.display_name AS a_name,
              (SELECT ete.roster_json FROM event_team_entries ete WHERE ete.event_id = ? AND ete.team_id = a.team_id LIMIT 1) AS a_roster_json,
              b.id AS b_entry_id, CAST(b.user_id AS CHAR) AS b_user_id, b.team_id AS b_team_id, b.display_name AS b_name,
              (SELECT ete.roster_json FROM event_team_entries ete WHERE ete.event_id = ? AND ete.team_id = b.team_id LIMIT 1) AS b_roster_json,
              mr.id AS report_id, mr.winner_entry_id AS report_winner_entry_id, mr.score_a, mr.score_b,
              mr.proof_url, mr.notes AS report_notes, mr.status AS report_status,
              CAST(mr.submitted_by AS CHAR) AS report_submitted_by, mr.created_at AS report_submitted_at,
              md.id AS dispute_id, md.reason AS dispute_reason, md.proof_url AS dispute_proof_url,
              CAST(md.opened_by AS CHAR) AS dispute_opened_by, md.created_at AS dispute_created_at
       FROM bracket_matches bm
       LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
       LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
       LEFT JOIN match_reports mr ON mr.id = (
         SELECT mr2.id FROM match_reports mr2 WHERE mr2.match_id = bm.id AND mr2.status <> 'VOID' ORDER BY mr2.created_at DESC LIMIT 1
       )
       LEFT JOIN match_disputes md ON md.id = (
         SELECT md2.id FROM match_disputes md2 WHERE md2.match_id = bm.id AND md2.status = 'OPEN' ORDER BY md2.created_at DESC LIMIT 1
       )
       WHERE bm.bracket_id = ? ORDER BY bm.round_number ASC, bm.match_number ASC`,
      [eventId, eventId, bracket.id],
    ),
    query<CareerMatchRow[]>(
      `SELECT CAST(w.user_id AS CHAR) AS winner_user_id, CAST(a.user_id AS CHAR) AS a_user_id,
              CAST(b.user_id AS CHAR) AS b_user_id, bm.completed_at, bm.updated_at
       FROM bracket_matches bm
       LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
       LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
       LEFT JOIN bracket_entries w ON w.id = bm.winner_entry_id
       WHERE bm.status IN ('COMPLETED', 'FORFEIT') AND a.user_id IS NOT NULL AND b.user_id IS NOT NULL
         AND (a.user_id = ? OR b.user_id = ?)
       ORDER BY COALESCE(bm.completed_at, bm.updated_at) DESC LIMIT 200`,
      [session.userId, session.userId],
    ),
    query<ChampionRow[]>(
      `SELECT COUNT(*) AS total FROM bracket_entries be INNER JOIN brackets br ON br.id = be.bracket_id
       WHERE be.user_id = ? AND be.status = 'ADVANCED' AND br.status = 'COMPLETED'`,
      [session.userId],
    ),
  ]);

  const settings = settingsRows[0] ?? { default_best_of: 1, no_show_minutes: 15, confirmation_minutes: 30, paused_at: null, pause_reason: null };
  const matches: MatchCenterMatch[] = matchRows.map((match) => {
    const aRoster = parseRoster(match.a_roster_json);
    const bRoster = parseRoster(match.b_roster_json);
    const mineA = sideContains(session.userId, match.a_user_id, aRoster);
    const mineB = sideContains(session.userId, match.b_user_id, bRoster);
    const canSeeEvidence = tournamentAccess.manager || mineA || mineB;
    return {
      id: match.id,
      roundNumber: match.round_number,
      matchNumber: match.match_number,
      stageLabel: match.stage_label,
      groupKey: match.group_key,
      bracketSide: match.bracket_side,
      status: match.status,
      scheduledAt: iso(match.scheduled_at),
      noShowDeadlineAt: iso(match.no_show_deadline_at),
      bestOf: match.best_of,
      readyAAt: iso(match.ready_a_at),
      readyBAt: iso(match.ready_b_at),
      a: { entryId: match.a_entry_id, userId: match.a_user_id, teamId: match.a_team_id, name: match.a_name, roster: aRoster, isCurrentUser: mineA },
      b: { entryId: match.b_entry_id, userId: match.b_user_id, teamId: match.b_team_id, name: match.b_name, roster: bRoster, isCurrentUser: mineB },
      winnerEntryId: match.winner_entry_id,
      report: match.report_id && match.report_winner_entry_id && match.report_status && match.report_submitted_by && match.report_submitted_at ? {
        id: match.report_id, winnerEntryId: match.report_winner_entry_id, scoreA: match.score_a, scoreB: match.score_b,
        proofUrl: canSeeEvidence ? match.proof_url : null, notes: canSeeEvidence ? match.report_notes : null, status: match.report_status,
        submittedBy: match.report_submitted_by, submittedAt: new Date(match.report_submitted_at).toISOString(),
      } : null,
      dispute: match.dispute_id && match.dispute_reason && match.dispute_opened_by && match.dispute_created_at ? {
        id: match.dispute_id,
        reason: canSeeEvidence ? match.dispute_reason : "A result dispute is under tournament staff review.",
        proofUrl: canSeeEvidence ? match.dispute_proof_url : null,
        openedBy: match.dispute_opened_by,
        createdAt: new Date(match.dispute_created_at).toISOString(),
      } : null,
    };
  });

  const wins = careerRows.filter((row) => row.winner_user_id === session.userId).length;
  const losses = careerRows.length - wins;
  let streakCount = 0;
  let streakType: "W" | "L" | null = null;
  for (const row of careerRows) {
    const type: "W" | "L" = row.winner_user_id === session.userId ? "W" : "L";
    if (!streakType) streakType = type;
    if (type !== streakType) break;
    streakCount += 1;
  }

  const standings = new Map<string, { name: string; wins: number; losses: number }>();
  for (const match of matchRows) {
    if (!match.a_entry_id || !match.b_entry_id || !["COMPLETED", "FORFEIT"].includes(match.status)) continue;
    for (const side of [{ id: match.a_entry_id, name: match.a_name ?? "Entrant A" }, { id: match.b_entry_id, name: match.b_name ?? "Entrant B" }]) {
      if (!standings.has(side.id)) standings.set(side.id, { name: side.name, wins: 0, losses: 0 });
    }
    if (match.winner_entry_id) {
      const winner = standings.get(match.winner_entry_id); if (winner) winner.wins += 1;
      const loserId = match.winner_entry_id === match.a_entry_id ? match.b_entry_id : match.a_entry_id;
      const loser = standings.get(loserId); if (loser) loser.losses += 1;
    }
  }
  const orderedStandings = [...standings.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));

  const headToHead = new Map<string, { name: string; wins: number; losses: number }>();
  if (event.bracket_entry_mode === "PLAYER") {
    for (const match of matchRows) {
      if (!["COMPLETED", "FORFEIT"].includes(match.status)) continue;
      const mineA = match.a_user_id === session.userId;
      const mineB = match.b_user_id === session.userId;
      if (!mineA && !mineB) continue;
      const opponentName = mineA ? match.b_name : match.a_name;
      const opponentId = mineA ? match.b_user_id : match.a_user_id;
      if (!opponentName || !opponentId) continue;
      const record = headToHead.get(opponentId) ?? { name: opponentName, wins: 0, losses: 0 };
      const myEntryId = mineA ? match.a_entry_id : match.b_entry_id;
      if (match.winner_entry_id === myEntryId) record.wins += 1; else record.losses += 1;
      headToHead.set(opponentId, record);
    }
  }

  return (
    <div className="section-stack tournament-operations-page">
      <section className="page-heading"><div><span className="eyebrow">Tournament operations</span><h1>{event.name} Match Center</h1><p>Schedule matches, ready players or teams, confirm results, handle disputes, and follow every competition stage.</p></div><div className="button-row"><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link>{event.bracket_entry_mode === "TEAM" ? <Link className="button button-secondary" href={`/dashboard/events/${eventId}/teams`}>Tournament teams</Link> : null}<Link className="button button-secondary" href={`/dashboard/events/${eventId}/bracket`}>View competition</Link></div></section>

      <div className="tournament-stat-grid"><div className="stat-card"><span>Player career record</span><strong>{wins}–{losses}</strong></div><div className="stat-card"><span>Current player streak</span><strong>{streakType ? `${streakType}${streakCount}` : "—"}</strong></div><div className="stat-card"><span>Player championships</span><strong>{championRows[0]?.total ?? 0}</strong></div><div className="stat-card"><span>Competition stage</span><strong>{bracket.status.replaceAll("_", " ")}</strong></div></div>

      <MatchCenter eventId={eventId} currentUserId={session.userId} canManage={tournamentAccess.manager} paused={Boolean(settings.paused_at)} pauseReason={settings.pause_reason} settings={{ defaultBestOf: settings.default_best_of, noShowMinutes: settings.no_show_minutes, confirmationMinutes: settings.confirmation_minutes }} matches={matches} />

      <div className="dashboard-grid">
        <section className="panel section-stack"><div><h2>Event match record</h2><p className="muted">Confirmed head-to-head matches and staff-decided forfeits. Automatic byes do not count as wins.</p></div>{orderedStandings.length ? <div className="standings-list">{orderedStandings.map((record, index) => <div className="standing-row" key={record.name}><span>#{index + 1}</span><strong>{record.name}</strong><span>{record.wins} W · {record.losses} L</span></div>)}</div> : <div className="empty-state">No completed head-to-head matches yet.</div>}</section>
        <section className="panel section-stack"><div><h2>{event.bracket_entry_mode === "TEAM" ? "Team match access" : "Your head-to-head"}</h2><p className="muted">{event.bracket_entry_mode === "TEAM" ? "Your registered roster determines which team matches you can ready, report, confirm, or dispute." : "Your confirmed record against opponents in this event."}</p></div>{event.bracket_entry_mode === "TEAM" ? <div className="empty-state">{onRegisteredTeam ? "You are rostered on a registered tournament team." : "You are not rostered on a registered tournament team."}</div> : headToHead.size ? <div className="standings-list">{[...headToHead.values()].sort((a,b) => (b.wins+b.losses)-(a.wins+a.losses)).map((record) => <div className="standing-row" key={record.name}><strong>{record.name}</strong><span>{record.wins}–{record.losses}</span></div>)}</div> : <div className="empty-state">No head-to-head history in this event yet.</div>}</section>
      </div>
    </div>
  );
}
