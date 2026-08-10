"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PoolItem = { id: string; label: string; details: string | null };
type SavedPool = { id: string; name: string; poolType: "GAME" | "MAP" | "MIXED"; items: PoolItem[] };

function parseLines(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter((item) => {
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ScoreboardTool({ compact = false }: { compact?: boolean }) {
  const [nameA, setNameA] = useState("Team A");
  const [nameB, setNameB] = useState("Team B");
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [target, setTarget] = useState(0);
  const [presentation, setPresentation] = useState(false);
  const winner = target > 0 && scoreA !== scoreB ? (scoreA >= target ? nameA : scoreB >= target ? nameB : null) : null;

  function reset() { setScoreA(0); setScoreB(0); }
  function swap() {
    setNameA(nameB); setNameB(nameA);
    setScoreA(scoreB); setScoreB(scoreA);
  }

  return (
    <article className={`studio-card scoreboard-tool${presentation ? " presentation" : ""}${compact ? " compact" : ""}`}>
      <header className="studio-card-header"><div><span className="card-kicker">Live score</span><h2>Scoreboard</h2></div><div className="button-row"><button className="button button-secondary" type="button" onClick={swap}>Swap sides</button><button className="button button-secondary" type="button" onClick={() => setPresentation((value) => !value)}>{presentation ? "Exit presentation" : "Presentation"}</button></div></header>
      <div className="scoreboard-display">
        <section><input aria-label="Side A name" value={nameA} onChange={(event) => setNameA(event.target.value)} maxLength={40} /><strong>{scoreA}</strong><div className="score-buttons"><button type="button" onClick={() => setScoreA((value) => Math.max(0, value - 1))}>−</button><button type="button" onClick={() => setScoreA((value) => value + 1)}>+</button></div></section>
        <span className="score-divider">–</span>
        <section><input aria-label="Side B name" value={nameB} onChange={(event) => setNameB(event.target.value)} maxLength={40} /><strong>{scoreB}</strong><div className="score-buttons"><button type="button" onClick={() => setScoreB((value) => Math.max(0, value - 1))}>−</button><button type="button" onClick={() => setScoreB((value) => value + 1)}>+</button></div></section>
      </div>
      {winner ? <div className="studio-winner-banner">🏆 {winner} reached the target score.</div> : null}
      <div className="studio-control-row"><label className="form-stack compact"><span>Target score <small>(0 = off)</small></span><input type="number" min={0} max={9999} value={target} onChange={(event) => setTarget(Math.max(0, Number(event.target.value) || 0))} /></label><button className="button button-secondary" type="button" onClick={reset}>Reset score</button></div>
    </article>
  );
}

export function TimerTool({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"COUNTDOWN" | "STOPWATCH">("COUNTDOWN");
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const startedAt = useRef<number | null>(null);
  const baseElapsed = useRef(0);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const timer = window.setInterval(() => {
      const started = startedAt.current ?? Date.now();
      const next = baseElapsed.current + Math.floor((Date.now() - started) / 1000);
      if (mode === "COUNTDOWN" && next >= durationSeconds) {
        setElapsed(durationSeconds);
        baseElapsed.current = durationSeconds;
        setRunning(false);
        setCompleted(true);
        return;
      }
      setElapsed(next);
    }, 250);
    return () => window.clearInterval(timer);
  }, [running, durationSeconds, mode]);

  function toggle() {
    if (running) {
      const started = startedAt.current ?? Date.now();
      baseElapsed.current += Math.floor((Date.now() - started) / 1000);
      setElapsed(baseElapsed.current);
      setRunning(false);
    } else {
      if (mode === "COUNTDOWN" && elapsed >= durationSeconds) { baseElapsed.current = 0; setElapsed(0); }
      startedAt.current = Date.now();
      setCompleted(false);
      setRunning(true);
    }
  }

  function reset() { setRunning(false); setElapsed(0); setCompleted(false); baseElapsed.current = 0; startedAt.current = null; }
  function setPreset(seconds: number) { setMode("COUNTDOWN"); setDurationSeconds(seconds); reset(); }
  const shown = mode === "COUNTDOWN" ? Math.max(0, durationSeconds - elapsed) : elapsed;

  return (
    <article className={`studio-card timer-studio-tool${compact ? " compact" : ""}`}>
      <header className="studio-card-header"><div><span className="card-kicker">Round control</span><h2>Timer</h2></div><div className="segmented-control"><button type="button" className={mode === "COUNTDOWN" ? "active" : ""} onClick={() => { setMode("COUNTDOWN"); reset(); }}>Countdown</button><button type="button" className={mode === "STOPWATCH" ? "active" : ""} onClick={() => { setMode("STOPWATCH"); reset(); }}>Stopwatch</button></div></header>
      <div className={`studio-clock${completed ? " completed" : ""}`}>{formatClock(shown)}</div>
      {completed ? <div className="studio-winner-banner">⏰ Time!</div> : null}
      {mode === "COUNTDOWN" ? <div className="timer-presets"><button type="button" onClick={() => setPreset(30)}>30 sec</button><button type="button" onClick={() => setPreset(60)}>1 min</button><button type="button" onClick={() => setPreset(180)}>3 min</button><button type="button" onClick={() => setPreset(300)}>5 min</button><button type="button" onClick={() => setPreset(600)}>10 min</button><label>Seconds<input type="number" min={1} max={86400} value={durationSeconds} onChange={(event) => { setDurationSeconds(Math.max(1, Number(event.target.value) || 1)); reset(); }} /></label></div> : null}
      <div className="button-row"><button className="button" type="button" onClick={toggle}>{running ? "Pause" : elapsed ? "Resume" : "Start"}</button><button className="button button-secondary" type="button" onClick={reset}>Reset</button></div>
    </article>
  );
}

export function PlayerPickerTool({ compact = false }: { compact?: boolean }) {
  const [names, setNames] = useState("Player 1\nPlayer 2\nPlayer 3\nPlayer 4\nPlayer 5\nPlayer 6");
  const [history, setHistory] = useState<string[]>([]);
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<string[][]>([]);
  const players = useMemo(() => parseLines(names), [names]);
  const remaining = players.filter((player) => !history.includes(player));
  const selected = history[0] ?? null;

  function pick() {
    let pool = remaining;
    let nextHistory = history;
    if (!pool.length) { pool = players; nextHistory = []; }
    if (!pool.length) return;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    setHistory([picked, ...nextHistory]);
  }
  function generateTeams() {
    const shuffledPlayers = shuffled(players);
    const count = Math.max(2, Math.min(teamCount, shuffledPlayers.length || 2));
    const next = Array.from({ length: count }, () => [] as string[]);
    shuffledPlayers.forEach((player, index) => next[index % count].push(player));
    setTeams(next);
  }

  return (
    <article className={`studio-card${compact ? " compact" : ""}`}>
      <header className="studio-card-header"><div><span className="card-kicker">Players</span><h2>Player picker & teams</h2></div><span className="badge">{players.length} players</span></header>
      <textarea rows={compact ? 5 : 8} value={names} onChange={(event) => { setNames(event.target.value); setHistory([]); setTeams([]); }} />
      {selected ? <div className="pool-pick-result"><span>Picked</span><strong>{selected}</strong><small>{remaining.length} not used yet</small></div> : null}
      <div className="button-row"><button className="button" type="button" onClick={pick} disabled={!players.length}>{remaining.length ? "Pick player" : "Start new pick cycle"}</button>{history.length ? <button className="button button-secondary" type="button" onClick={() => setHistory([])}>Reset picks</button> : null}</div>
      <div className="studio-team-controls"><label>Teams<input type="number" min={2} max={32} value={teamCount} onChange={(event) => setTeamCount(Math.max(2, Number(event.target.value) || 2))} /></label><button className="button button-secondary" type="button" onClick={generateTeams} disabled={players.length < 2}>Generate teams</button></div>
      {teams.length ? <div className="generated-grid">{teams.map((team, index) => <div className="generated-list" key={index}><strong>Team {index + 1}</strong>{team.map((player) => <span key={player}>{player}</span>)}</div>)}</div> : null}
    </article>
  );
}

export function SavedPoolQuickPicker({ compact = false }: { compact?: boolean }) {
  const [pools, setPools] = useState<SavedPool[]>([]);
  const [poolId, setPoolId] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/tools/pools", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { pools?: SavedPool[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Saved pools could not be loaded.");
      setPools(body.pools ?? []);
      setPoolId((current) => current || body.pools?.[0]?.id || "");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Saved pools could not be loaded."));
  }, []);

  const pool = pools.find((item) => item.id === poolId) ?? null;
  const remaining = pool ? pool.items.filter((item) => !history.includes(item.id)) : [];
  const selected = pool?.items.find((item) => item.id === history[0]) ?? null;

  function pick() {
    if (!pool) return;
    let available = remaining;
    let nextHistory = history;
    if (!available.length) { available = pool.items; nextHistory = []; }
    if (!available.length) return;
    const chosen = available[Math.floor(Math.random() * available.length)];
    setHistory([chosen.id, ...nextHistory]);
  }

  return (
    <article className={`studio-card${compact ? " compact" : ""}`}>
      <header className="studio-card-header"><div><span className="card-kicker">Games & maps</span><h2>Saved pool picker</h2></div><a className="text-link" href="/dashboard/tools/pools">Manage pools</a></header>
      {error ? <p className="form-message">{error}</p> : pools.length ? <>
        <label className="form-stack compact"><span>Pool</span><select value={poolId} onChange={(event) => { setPoolId(event.target.value); setHistory([]); }}>{pools.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.poolType.toLowerCase()}</option>)}</select></label>
        {selected ? <div className="pool-pick-result"><span>Selected</span><strong>{selected.label}</strong>{selected.details ? <small>{selected.details}</small> : null}</div> : <div className="empty-state compact">Pick from {pool?.items.length ?? 0} saved items.</div>}
        <div className="button-row"><button className="button" type="button" onClick={pick} disabled={!pool?.items.length}>{remaining.length ? "Pick next" : "Start new cycle"}</button>{history.length ? <button className="button button-secondary" type="button" onClick={() => setHistory([])}>Reset cycle</button> : null}</div>
      </> : <div className="empty-state">No saved pools yet. <a className="text-link" href="/dashboard/tools/pools">Create your first pool</a>.</div>}
    </article>
  );
}

export function GameNightStudio() {
  return (
    <div className="studio-grid">
      <ScoreboardTool />
      <TimerTool />
      <PlayerPickerTool />
      <SavedPoolQuickPicker />
    </div>
  );
}
