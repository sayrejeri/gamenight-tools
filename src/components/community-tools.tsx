"use client";

import { useMemo, useState } from "react";

function lines(value: string): string[] { return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean); }
function shuffle<T>(items: T[]): T[] { const copy = [...items]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }

export function RandomTeamTool() {
  const [names, setNames] = useState("Player 1\nPlayer 2\nPlayer 3\nPlayer 4");
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<string[][]>([]);
  function generate() { const players = shuffle(lines(names)); const count = Math.max(2, Math.min(teamCount, players.length)); const next = Array.from({ length: count }, () => [] as string[]); players.forEach((player, index) => next[index % count].push(player)); setTeams(next); }
  return <article className="tool-panel"><span className="card-kicker">Random teams</span><h2>Team generator</h2><p>Split a player list into evenly sized random teams.</p><textarea rows={7} value={names} onChange={(event) => setNames(event.target.value)} /><label>Number of teams<input type="number" min={2} max={32} value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))} /></label><button className="button" type="button" onClick={generate}>Generate teams</button>{teams.length ? <div className="generated-grid">{teams.map((team, index) => <div className="generated-list" key={index}><strong>Team {index + 1}</strong>{team.map((name) => <span key={name}>{name}</span>)}</div>)}</div> : null}</article>;
}

export function MatchupTool() {
  const [names, setNames] = useState("Player 1\nPlayer 2\nPlayer 3\nPlayer 4"); const [pairs, setPairs] = useState<Array<[string, string | null]>>([]);
  function generate() { const players = shuffle(lines(names)); const next: Array<[string, string | null]> = []; for (let i = 0; i < players.length; i += 2) next.push([players[i], players[i + 1] ?? null]); setPairs(next); }
  return <article className="tool-panel"><span className="card-kicker">Quick matches</span><h2>Matchup generator</h2><p>Pair players or teams without creating a full bracket.</p><textarea rows={7} value={names} onChange={(event) => setNames(event.target.value)} /><button className="button" type="button" onClick={generate}>Generate matchups</button>{pairs.length ? <div className="generated-list">{pairs.map((pair, index) => <span key={index}><strong>Match {index + 1}:</strong> {pair[0]} vs {pair[1] ?? "BYE"}</span>)}</div> : null}</article>;
}

export function MapPickerTool() {
  const [options, setOptions] = useState("Map 1\nMap 2\nMap 3"); const [picked, setPicked] = useState<string[]>([]); const [removeAfterPick, setRemoveAfterPick] = useState(true);
  const remaining = useMemo(() => lines(options).filter((option) => !picked.includes(option)), [options, picked]);
  function pick() { const pool = removeAfterPick ? remaining : lines(options); if (!pool.length) { setPicked([]); return; } const result = pool[Math.floor(Math.random() * pool.length)]; setPicked((current) => [result, ...current].slice(0, 12)); }
  return <article className="tool-panel"><span className="card-kicker">Maps and modes</span><h2>Random picker</h2><p>Choose maps, modes, challenges, or prompts with optional no-repeat behavior.</p><textarea rows={7} value={options} onChange={(event) => { setOptions(event.target.value); setPicked([]); }} /><label className="checkbox-row"><input type="checkbox" checked={removeAfterPick} onChange={(event) => setRemoveAfterPick(event.target.checked)} />Remove a result after it is picked</label><button className="button" type="button" onClick={pick}>{remaining.length || !removeAfterPick ? "Pick one" : "Reset picks"}</button>{picked[0] ? <div className="picker-result"><span>Selected</span><strong>{picked[0]}</strong></div> : null}{picked.length > 1 ? <div className="generated-list"><strong>Previous</strong>{picked.slice(1).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div> : null}</article>;
}

export function AnnouncementBuilder() {
  const [eventName, setEventName] = useState("Friday Game Night"); const [game, setGame] = useState("Roblox"); const [time, setTime] = useState(""); const [prize, setPrize] = useState(""); const [signup, setSignup] = useState(""); const [copied, setCopied] = useState(false);
  const announcement = `🎮 **${eventName || "Game Night"}**\n**Game:** ${game || "TBA"}\n**When:** ${time || "TBA"}${prize ? `\n**Prize:** ${prize}` : ""}${signup ? `\n**Sign up:** ${signup}` : ""}`;
  async function copy() { await navigator.clipboard.writeText(announcement); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  return <article className="tool-panel"><span className="card-kicker">Discord-ready</span><h2>Announcement builder</h2><p>Build a clean event message before sending it manually or through a connected webhook.</p><input value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="Event name" /><input value={game} onChange={(event) => setGame(event.target.value)} placeholder="Game" /><input value={time} onChange={(event) => setTime(event.target.value)} placeholder="Saturday at 8:00 PM local time" /><input value={prize} onChange={(event) => setPrize(event.target.value)} placeholder="Prize (optional)" /><input value={signup} onChange={(event) => setSignup(event.target.value)} placeholder="Signup URL" /><pre className="announcement-preview">{announcement}</pre><button className="button" type="button" onClick={copy}>{copied ? "Copied" : "Copy announcement"}</button></article>;
}

export function CountdownTool() {
  const [value, setValue] = useState(""); const target = value ? new Date(value) : null; const valid = target && !Number.isNaN(target.getTime());
  const display = valid ? new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(target) : "Choose a date and time";
  const discord = valid ? `<t:${Math.floor(target.getTime() / 1000)}:F> · <t:${Math.floor(target.getTime() / 1000)}:R>` : "";
  return <article className="tool-panel"><span className="card-kicker">Local time</span><h2>Time and countdown</h2><p>Turn a local date into Discord timestamps that display correctly for every viewer.</p><input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} /><div className="picker-result"><span>Your browser shows</span><strong>{display}</strong></div>{discord ? <><code className="code-output">{discord}</code><button className="button button-secondary" type="button" onClick={() => navigator.clipboard.writeText(discord)}>Copy Discord timestamps</button></> : null}</article>;
}
