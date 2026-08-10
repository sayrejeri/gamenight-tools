"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Side = { entryId: string; name: string; isCurrentUser: boolean };
export type SeriesGame = { gameNumber: number; mapName: string; modeName: string | null; winnerEntryId: string; scoreA: number | null; scoreB: number | null };
export type SeriesDeskMatch = {
  id: string;
  label: string;
  status: string;
  bestOf: number;
  a: Side;
  b: Side;
  report: null | { scoreA: number | null; scoreB: number | null; status: string; games: SeriesGame[] };
};
type PoolItem = { id: string; label: string; details: string | null };
type SavedPool = { id: string; name: string; poolType: string; items: PoolItem[] };
type EditableGame = { gameNumber: number; mapName: string; modeName: string; winnerEntryId: string; scoreA: string; scoreB: string };

type Props = { eventId: string; matches: SeriesDeskMatch[]; canManage: boolean };

function requiredWins(bestOf: number) { return Math.floor(bestOf / 2) + 1; }
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
function emptyGame(number: number, defaultWinner: string): EditableGame {
  return { gameNumber: number, mapName: "", modeName: "", winnerEntryId: defaultWinner, scoreA: "", scoreB: "" };
}
function statusLabel(value: string) { return value.replaceAll("_", " "); }

export function SeriesReportingDesk({ eventId, matches, canManage }: Props) {
  const router = useRouter();
  const [pools, setPools] = useState<SavedPool[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/tools/pools", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { pools?: SavedPool[] };
      setPools(body.pools ?? []);
    }).catch(() => undefined);
  }, []);

  async function submit(match: SeriesDeskMatch, games: EditableGame[]) {
    setBusy(match.id); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/series`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          games: games.map((game) => ({
            gameNumber: game.gameNumber,
            mapName: game.mapName,
            modeName: game.modeName,
            winnerEntryId: game.winnerEntryId,
            scoreA: game.scoreA === "" ? null : Number(game.scoreA),
            scoreB: game.scoreB === "" ? null : Number(game.scoreB),
          })),
        }),
      });
      const body = await response.json() as { error?: string; score?: string };
      if (!response.ok) throw new Error(body.error ?? "Series result could not be submitted.");
      setMessage(`Series result ${body.score ?? ""} submitted for opponent confirmation.`.trim());
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Series result could not be submitted."); }
    finally { setBusy(null); }
  }

  return (
    <div className="section-stack series-reporting-desk">
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      {matches.length ? matches.map((match) => <SeriesMatchCard key={match.id} match={match} pools={pools} canManage={canManage} busy={busy === match.id} onSubmit={(games) => submit(match, games)} />) : <div className="empty-state">No tournament matches are available in the series desk yet.</div>}
    </div>
  );
}

function SeriesMatchCard({ match, pools, canManage, busy, onSubmit }: { match: SeriesDeskMatch; pools: SavedPool[]; canManage: boolean; busy: boolean; onSubmit: (games: EditableGame[]) => void }) {
  const mine = match.a.isCurrentUser || match.b.isCurrentUser;
  const [games, setGames] = useState<EditableGame[]>([emptyGame(1, match.a.entryId)]);
  const [poolId, setPoolId] = useState("");
  const wins = useMemo(() => games.reduce((result, game) => {
    if (game.winnerEntryId === match.a.entryId) result.a += 1;
    if (game.winnerEntryId === match.b.entryId) result.b += 1;
    return result;
  }, { a: 0, b: 0 }), [games, match.a.entryId, match.b.entryId]);
  const needed = requiredWins(match.bestOf);
  const clinched = wins.a >= needed || wins.b >= needed;
  const selectedPool = pools.find((pool) => pool.id === poolId) ?? null;

  function updateGame(index: number, patch: Partial<EditableGame>) {
    setGames((current) => current.map((game, position) => position === index ? { ...game, ...patch } : game));
  }
  function addGame() {
    if (games.length >= match.bestOf || clinched) return;
    setGames((current) => [...current, emptyGame(current.length + 1, match.a.entryId)]);
  }
  function removeGame(index: number) {
    setGames((current) => current.filter((_, position) => position !== index).map((game, position) => ({ ...game, gameNumber: position + 1 })));
  }
  function fillFromPool() {
    if (!selectedPool?.items.length) return;
    const choices = shuffle(selectedPool.items).slice(0, needed);
    setGames(choices.map((item, index) => ({ ...emptyGame(index + 1, match.a.entryId), mapName: item.label, modeName: item.details ?? "" })));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(games);
  }

  return (
    <article className="panel section-stack series-match-card">
      <header className="series-match-heading"><div><span className="eyebrow">{match.label}</span><h2>{match.a.name} <span className="muted">vs</span> {match.b.name}</h2></div><div className="button-row"><span className="badge">Best of {match.bestOf}</span><span className="badge">{statusLabel(match.status)}</span></div></header>

      {match.report?.games.length ? <SeriesSummary match={match} /> : null}

      {match.status === "LIVE" && mine ? <form className="section-stack series-entry-form" onSubmit={submit}>
        <div className="series-score-preview"><div><span>{match.a.name}</span><strong>{wins.a}</strong></div><span>First to {needed}</span><div><span>{match.b.name}</span><strong>{wins.b}</strong></div></div>
        {pools.length ? <div className="series-pool-row"><label className="form-stack compact"><span>Optional saved map/game pool</span><select value={poolId} onChange={(event) => setPoolId(event.target.value)}><option value="">Choose a pool</option>{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</select></label><button className="button button-secondary" type="button" disabled={!selectedPool} onClick={fillFromPool}>Randomize opening maps</button></div> : null}
        <div className="series-game-list">{games.map((game, index) => <div className="series-game-row" key={game.gameNumber}>
          <strong>Game {game.gameNumber}</strong>
          <input value={game.mapName} onChange={(event) => updateGame(index, { mapName: event.target.value })} placeholder="Map / game" maxLength={191} required />
          <input value={game.modeName} onChange={(event) => updateGame(index, { modeName: event.target.value })} placeholder="Mode (optional)" maxLength={80} />
          <select value={game.winnerEntryId} onChange={(event) => updateGame(index, { winnerEntryId: event.target.value })}><option value={match.a.entryId}>{match.a.name} won</option><option value={match.b.entryId}>{match.b.name} won</option></select>
          <div className="score-inputs"><label><span>A</span><input type="number" min={0} max={999} value={game.scoreA} onChange={(event) => updateGame(index, { scoreA: event.target.value })} /></label><label><span>B</span><input type="number" min={0} max={999} value={game.scoreB} onChange={(event) => updateGame(index, { scoreB: event.target.value })} /></label></div>
          {games.length > 1 && index === games.length - 1 ? <button className="series-remove-game" type="button" onClick={() => removeGame(index)} aria-label={`Remove Game ${game.gameNumber}`}>×</button> : null}
        </div>)}</div>
        <div className="button-row"><button className="button button-secondary" type="button" disabled={games.length >= match.bestOf || clinched} onClick={addGame}>Add next game</button><button className="button" disabled={busy || !clinched || games.some((game) => !game.mapName.trim())}>{busy ? "Submitting…" : clinched ? `Submit ${wins.a}-${wins.b} series` : `Need ${needed} wins to finish`}</button></div>
      </form> : null}

      {match.status === "LIVE" && !mine && canManage ? <div className="rule-callout"><strong>Staff view</strong><p>Players or snapshotted team members submit normal series reports. Use Match Center staff controls for overrides, forfeits, or corrections.</p></div> : null}
      {["AWAITING_CONFIRMATION", "DISPUTED"].includes(match.status) ? <div className="rule-callout"><strong>Series submitted</strong><p>This result is waiting for opponent confirmation or tournament staff review in Match Center.</p></div> : null}
    </article>
  );
}

function SeriesSummary({ match }: { match: SeriesDeskMatch }) {
  const games = match.report?.games ?? [];
  return <div className="series-summary"><header><strong>Reported series</strong><span>{match.report?.scoreA ?? "—"} – {match.report?.scoreB ?? "—"} · {statusLabel(match.report?.status ?? "PENDING")}</span></header><div>{games.map((game) => <div key={game.gameNumber}><span>Game {game.gameNumber}</span><strong>{game.mapName}{game.modeName ? ` · ${game.modeName}` : ""}</strong><span>{game.winnerEntryId === match.a.entryId ? match.a.name : match.b.name}{game.scoreA != null && game.scoreB != null ? ` · ${game.scoreA}-${game.scoreB}` : ""}</span></div>)}</div></div>;
}
