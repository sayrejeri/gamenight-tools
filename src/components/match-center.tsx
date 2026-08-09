"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type MatchCenterMatch = {
  id: string;
  roundNumber: number;
  matchNumber: number;
  status: string;
  scheduledAt: string | null;
  noShowDeadlineAt: string | null;
  bestOf: number;
  readyAAt: string | null;
  readyBAt: string | null;
  a: { entryId: string | null; userId: string | null; name: string | null };
  b: { entryId: string | null; userId: string | null; name: string | null };
  winnerEntryId: string | null;
  report: null | {
    id: string;
    winnerEntryId: string;
    scoreA: number | null;
    scoreB: number | null;
    proofUrl: string | null;
    notes: string | null;
    status: string;
    submittedBy: string;
    submittedAt: string;
  };
  dispute: null | { id: string; reason: string; proofUrl: string | null; openedBy: string; createdAt: string };
};

type Settings = { defaultBestOf: number; noShowMinutes: number; confirmationMinutes: number };

type Props = {
  eventId: string;
  currentUserId: string;
  canManage: boolean;
  paused: boolean;
  pauseReason: string | null;
  settings: Settings;
  matches: MatchCenterMatch[];
};

type Filter = "active" | "mine" | "disputed" | "completed" | "all";

function statusLabel(value: string): string { return value.replaceAll("_", " "); }
function localInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function MatchCenter({ eventId, currentUserId, canManage, paused, pauseReason, settings, matches }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pauseText, setPauseText] = useState("");
  const [defaultBestOf, setDefaultBestOf] = useState(settings.defaultBestOf);
  const [noShowMinutes, setNoShowMinutes] = useState(settings.noShowMinutes);
  const [confirmationMinutes, setConfirmationMinutes] = useState(settings.confirmationMinutes);

  const visibleMatches = useMemo(() => matches.filter((match) => {
    const mine = match.a.userId === currentUserId || match.b.userId === currentUserId;
    if (filter === "mine") return mine;
    if (filter === "disputed") return match.status === "DISPUTED";
    if (filter === "completed") return ["COMPLETED", "FORFEIT"].includes(match.status);
    if (filter === "active") return !["COMPLETED", "FORFEIT"].includes(match.status);
    return true;
  }), [matches, filter, currentUserId]);

  async function matchAction(matchId: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(`${matchId}:${action}`); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/matches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action, ...extra }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Match update failed.");
      setMessage("Match updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Match update failed.");
    } finally { setBusy(null); }
  }

  async function tournamentAction(action: "SETTINGS" | "PAUSE" | "RESUME", extra: Record<string, unknown> = {}) {
    setBusy(`tournament:${action}`); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/tournament`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Tournament update failed.");
      setMessage(action === "PAUSE" ? "Tournament paused." : action === "RESUME" ? "Tournament resumed." : "Tournament settings saved.");
      setPauseText("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tournament update failed.");
    } finally { setBusy(null); }
  }

  return (
    <div className="section-stack match-center">
      {paused ? <div className="tournament-pause-banner"><strong>Tournament paused</strong><span>{pauseReason ?? "The host paused match operations."}</span></div> : null}

      {canManage ? (
        <details className="panel match-settings-panel">
          <summary><strong>Tournament controls</strong><span className="muted">Scheduling defaults, grace periods, and pause controls</span></summary>
          <div className="section-stack match-settings-body">
            <div className="three-column">
              <label className="form-stack compact"><span>Default series</span><select value={defaultBestOf} onChange={(event) => setDefaultBestOf(Number(event.target.value))}>{[1,3,5,7,9].map((value) => <option key={value} value={value}>Best of {value}</option>)}</select></label>
              <label className="form-stack compact"><span>No-show grace (minutes)</span><input type="number" min={1} max={180} value={noShowMinutes} onChange={(event) => setNoShowMinutes(Number(event.target.value))} /></label>
              <label className="form-stack compact"><span>Result confirmation (minutes)</span><input type="number" min={1} max={1440} value={confirmationMinutes} onChange={(event) => setConfirmationMinutes(Number(event.target.value))} /></label>
            </div>
            <div className="button-row">
              <button className="button" type="button" disabled={busy !== null} onClick={() => tournamentAction("SETTINGS", { defaultBestOf, noShowMinutes, confirmationMinutes })}>Save tournament settings</button>
            </div>
            {paused ? (
              <button className="button" type="button" disabled={busy !== null} onClick={() => tournamentAction("RESUME")}>Resume tournament</button>
            ) : (
              <div className="two-column">
                <input value={pauseText} onChange={(event) => setPauseText(event.target.value)} placeholder="Reason for pause" maxLength={500} />
                <button className="button button-secondary" type="button" disabled={busy !== null || pauseText.trim().length < 3} onClick={() => tournamentAction("PAUSE", { reason: pauseText })}>Pause tournament</button>
              </div>
            )}
          </div>
        </details>
      ) : null}

      <div className="match-filter-row" role="group" aria-label="Match filters">
        {(["active", "mine", "disputed", "completed", "all"] as const).map((value) => <button key={value} type="button" className={`filter-chip ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
      </div>

      {visibleMatches.length ? <div className="match-card-list">{visibleMatches.map((match) => {
        const mineA = match.a.userId === currentUserId;
        const mineB = match.b.userId === currentUserId;
        const mine = mineA || mineB;
        const opponentCanRespond = Boolean(match.report && mine && match.report.submittedBy !== currentUserId);
        const completed = ["COMPLETED", "FORFEIT"].includes(match.status);
        const winnerName = match.winnerEntryId === match.a.entryId ? match.a.name : match.winnerEntryId === match.b.entryId ? match.b.name : null;

        return (
          <article className={`match-card match-status-${match.status.toLowerCase()}`} key={match.id}>
            <header className="match-card-header"><div><span className="eyebrow">Round {match.roundNumber} · Match {match.matchNumber}</span><h3>{match.a.name ?? "TBD"} <span className="muted">vs</span> {match.b.name ?? "TBD"}</h3></div><span className="badge">{statusLabel(match.status)}</span></header>
            <div className="match-meta-grid">
              <div><span>Series</span><strong>Best of {match.bestOf}</strong></div>
              <div><span>Scheduled</span><strong>{match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "Not scheduled"}</strong></div>
              <div><span>Ready</span><strong>{match.readyAAt ? "A ✓" : "A —"} · {match.readyBAt ? "B ✓" : "B —"}</strong></div>
              <div><span>Winner</span><strong>{winnerName ?? "Pending"}</strong></div>
            </div>
            {match.noShowDeadlineAt && !completed ? <p className="muted">No-show decision available after {new Date(match.noShowDeadlineAt).toLocaleString()}.</p> : null}

            {match.report ? <div className="match-report-box"><strong>Reported result: {match.report.scoreA ?? "—"} – {match.report.scoreB ?? "—"}</strong><span>Status: {statusLabel(match.report.status)}</span>{match.report.notes ? <p>{match.report.notes}</p> : null}{match.report.proofUrl ? <a className="text-link" href={match.report.proofUrl} target="_blank" rel="noreferrer">Open submitted proof</a> : null}</div> : null}
            {match.dispute ? <div className="match-dispute-box"><strong>Open dispute</strong><p>{match.dispute.reason}</p>{match.dispute.proofUrl ? <a className="text-link" href={match.dispute.proofUrl} target="_blank" rel="noreferrer">Open dispute proof</a> : null}</div> : null}

            {!paused && mine && ["PENDING", "READY"].includes(match.status) ? <div className="button-row"><button className="button" type="button" disabled={busy !== null || (mineA ? Boolean(match.readyAAt) : Boolean(match.readyBAt))} onClick={() => matchAction(match.id, "READY")}>{(mineA ? match.readyAAt : match.readyBAt) ? "Ready ✓" : "I’m ready"}</button>{match.status === "READY" ? <button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => matchAction(match.id, "START")}>Start match</button> : null}</div> : null}

            {!paused && mine && match.status === "LIVE" ? <ResultForm match={match} busy={busy !== null} onSubmit={(values) => matchAction(match.id, "REPORT", values)} /> : null}

            {!paused && opponentCanRespond && ["AWAITING_CONFIRMATION", "DISPUTED"].includes(match.status) ? <div className="opponent-result-actions"><button className="button" type="button" disabled={busy !== null} onClick={() => matchAction(match.id, "CONFIRM")}>Confirm result</button>{match.status === "AWAITING_CONFIRMATION" ? <DisputeForm busy={busy !== null} onSubmit={(values) => matchAction(match.id, "DISPUTE", values)} /> : null}</div> : null}

            {canManage ? <StaffMatchControls match={match} busy={busy !== null} onAction={(action, values) => matchAction(match.id, action, values)} /> : null}
          </article>
        );
      })}</div> : <div className="empty-state">No matches match this filter.</div>}

      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}

function ResultForm({ match, busy, onSubmit }: { match: MatchCenterMatch; busy: boolean; onSubmit: (values: Record<string, unknown>) => void }) {
  const [winner, setWinner] = useState(match.a.entryId ?? "");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ winnerEntryId: winner, scoreA: scoreA === "" ? null : Number(scoreA), scoreB: scoreB === "" ? null : Number(scoreB), proofUrl, notes });
  }
  return <form className="match-action-form" onSubmit={submit}><strong>Report result</strong><div className="two-column"><label className="form-stack compact"><span>Winner</span><select value={winner} onChange={(event) => setWinner(event.target.value)}><option value={match.a.entryId ?? ""}>{match.a.name}</option><option value={match.b.entryId ?? ""}>{match.b.name}</option></select></label><div className="score-inputs"><label><span>A score</span><input type="number" min={0} max={999} value={scoreA} onChange={(event) => setScoreA(event.target.value)} /></label><label><span>B score</span><input type="number" min={0} max={999} value={scoreB} onChange={(event) => setScoreB(event.target.value)} /></label></div></div><input type="url" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Screenshot/video proof URL (optional)" /><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Result notes (optional)" maxLength={2000} /><button className="button" disabled={busy || !winner}>Submit result</button></form>;
}

function DisputeForm({ busy, onSubmit }: { busy: boolean; onSubmit: (values: Record<string, unknown>) => void }) {
  const [reason, setReason] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  return <div className="match-action-form"><strong>Dispute result</strong><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What is incorrect?" maxLength={2000} /><input type="url" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Evidence URL (optional)" /><button className="button button-danger" type="button" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit({ reason, proofUrl })}>Open dispute</button></div>;
}

function StaffMatchControls({ match, busy, onAction }: { match: MatchCenterMatch; busy: boolean; onAction: (action: string, values?: Record<string, unknown>) => void }) {
  const [scheduledAt, setScheduledAt] = useState(localInputValue(match.scheduledAt));
  const [bestOf, setBestOf] = useState(match.bestOf);
  const [winner, setWinner] = useState(match.a.entryId ?? "");
  const [reason, setReason] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const hasTwo = Boolean(match.a.entryId && match.b.entryId);
  const completed = ["COMPLETED", "FORFEIT"].includes(match.status);
  return <details className="staff-match-controls"><summary>Staff controls</summary><div className="section-stack compact-stack"><div className="two-column"><label className="form-stack compact"><span>Schedule</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label className="form-stack compact"><span>Series</span><select value={bestOf} onChange={(event) => setBestOf(Number(event.target.value))}>{[1,3,5,7,9].map((value) => <option key={value} value={value}>Best of {value}</option>)}</select></label></div><button className="button button-secondary" type="button" disabled={busy || !hasTwo} onClick={() => onAction("SCHEDULE", { scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null, bestOf })}>Save schedule</button>{!completed && ["PENDING", "READY"].includes(match.status) ? <button className="button button-secondary" type="button" disabled={busy || !hasTwo} onClick={() => onAction("START")}>Start now</button> : null}{!completed ? <div className="staff-decision-box"><strong>Staff decision / forfeit</strong><select value={winner} onChange={(event) => setWinner(event.target.value)}><option value={match.a.entryId ?? ""}>{match.a.name ?? "Player A"}</option><option value={match.b.entryId ?? ""}>{match.b.name ?? "Player B"}</option></select><div className="score-inputs"><label><span>A score</span><input type="number" min={0} max={999} value={scoreA} onChange={(event) => setScoreA(event.target.value)} /></label><label><span>B score</span><input type="number" min={0} max={999} value={scoreB} onChange={(event) => setScoreB(event.target.value)} /></label></div><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required staff reason" maxLength={2000} /><input type="url" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="Proof URL (optional)" /><div className="button-row"><button className="button" type="button" disabled={busy || !winner || reason.trim().length < 3} onClick={() => onAction("OVERRIDE", { winnerEntryId: winner, scoreA: scoreA === "" ? null : Number(scoreA), scoreB: scoreB === "" ? null : Number(scoreB), reason, proofUrl })}>Set result</button><button className="button button-danger" type="button" disabled={busy || !winner || reason.trim().length < 3} onClick={() => onAction("FORFEIT", { winnerEntryId: winner, reason, proofUrl })}>Forfeit / no-show</button>{match.report && ["PENDING", "DISPUTED"].includes(match.report.status) ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => onAction("CONFIRM")}>Confirm reported result</button> : null}</div></div> : <button className="button button-secondary" type="button" disabled={busy} onClick={() => { if (window.confirm("Reopen this result? Downstream bracket selections that depend on it may also be cleared.")) onAction("RESET"); }}>Reopen result</button>}</div></details>;
}
