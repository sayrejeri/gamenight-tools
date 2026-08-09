"use client";

import { useMemo, useState } from "react";
import {
  bracketChampion,
  buildDoubleEliminationCompetition,
  buildFirstRound,
  buildGroupsPlayoffCompetition,
  buildRoundRobinCompetition,
  deriveCompetitionStandings,
  deriveExpandedCompetitionMatches,
  deriveSingleElimination,
  expandedFormatLabel,
  getMatchSlotLabel,
  isDraft,
  makeParticipant,
  resolveThreePlayerAdvancement,
  shuffle,
  type BracketDraft,
  type BracketEntrantMode,
  type BracketFormat,
  type CompetitionMatchSpec,
  type DerivedMatch,
  type Pair,
  type Participant,
  type ResolvedCompetitionMatch,
  type ThreeWinnerMap,
  type TieBreakMode,
  type WinnerMap,
} from "@/components/bracket/bracket-model";
import { downloadBracketPng } from "@/components/bracket/bracket-export";
import { ThreeMatch } from "@/components/bracket/three-match";

export type BracketStatus = "DRAFT" | "GENERATED" | "LIVE" | "COMPLETED";
export type DatabaseBracketFormat = "SINGLE_ELIMINATION" | "THREE_PLAYER" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_PLAYOFFS";

function duplicateParticipantName(participants: Participant[]): string | null {
  const seen = new Set<string>();
  for (const participant of participants) {
    const normalized = participant.name.trim().toLocaleLowerCase();
    if (seen.has(normalized)) return participant.name.trim();
    seen.add(normalized);
  }
  return null;
}

function dbToDraftFormat(format: DatabaseBracketFormat): BracketFormat {
  if (format === "THREE_PLAYER") return "three";
  if (format === "DOUBLE_ELIMINATION") return "double";
  if (format === "ROUND_ROBIN") return "round_robin";
  if (format === "GROUPS_PLAYOFFS") return "groups";
  return "single";
}

function draftToDbFormat(format: BracketFormat): DatabaseBracketFormat {
  if (format === "three") return "THREE_PLAYER";
  if (format === "double") return "DOUBLE_ELIMINATION";
  if (format === "round_robin") return "ROUND_ROBIN";
  if (format === "groups") return "GROUPS_PLAYOFFS";
  return "SINGLE_ELIMINATION";
}

function minimumEntrants(format: BracketFormat): number {
  if (format === "three") return 3;
  if (format === "groups") return 4;
  return 2;
}

function ExpandedMatchCard({
  match,
  locked,
  onChoose,
}: {
  match: ResolvedCompetitionMatch;
  locked: boolean;
  onChoose: (match: ResolvedCompetitionMatch, participant: Participant) => void;
}) {
  const selectable = match.active && match.aReady && match.bReady && Boolean(match.a && match.b);
  return (
    <article className={`match-card expanded-match-card${!match.active ? " match-inactive" : ""}`}>
      <div className="match-card-heading"><span>{match.label}</span>{match.group ? <span className="badge">Group {match.group}</span> : null}</div>
      {[match.a, match.b].map((participant, slot) => {
        const winner = participant && match.winner?.id === participant.id;
        return (
          <button
            className={`match-participant${winner ? " winner" : ""}${!participant ? " bye" : ""}`}
            type="button"
            key={`${match.id}-${slot}`}
            disabled={locked || !participant || !selectable}
            onClick={() => participant && onChoose(match, participant)}
          >
            <span>{participant?.name ?? (match.active && (slot === 0 ? match.aReady : match.bReady) ? "BYE" : "TBD")}</span>
            {winner ? <strong>Winner</strong> : null}
          </button>
        );
      })}
      {!match.active ? <span className="field-help">Only played if the lower-bracket finalist forces a reset.</span> : null}
    </article>
  );
}

export function BracketGenerator({
  eventId,
  initialTitle,
  initialNames,
  initialParticipants,
  initialDraft,
  initialStatus = "DRAFT",
  initialUpdatedAt = null,
  initialConfiguredFormat = "SINGLE_ELIMINATION",
  initialEntrantMode = "PLAYER",
  initialGroupCount = 2,
  initialAdvancersPerGroup = 1,
  initialTieBreakMode = "HEAD_TO_HEAD_THEN_SEED",
  initialSeedingMode = "RANDOM",
}: {
  eventId?: string;
  initialTitle?: string;
  initialNames?: string[];
  initialParticipants?: Participant[];
  initialDraft?: unknown;
  initialStatus?: BracketStatus;
  initialUpdatedAt?: string | null;
  initialConfiguredFormat?: DatabaseBracketFormat;
  initialEntrantMode?: "PLAYER" | "TEAM";
  initialGroupCount?: number;
  initialAdvancersPerGroup?: number;
  initialTieBreakMode?: TieBreakMode;
  initialSeedingMode?: "RANDOM" | "MANUAL";
}) {
  const saved = isDraft(initialDraft) ? initialDraft : null;
  const configuredFormat = dbToDraftFormat(initialConfiguredFormat);
  const seededParticipants = initialParticipants?.length
    ? initialParticipants
    : initialNames?.length
      ? initialNames.map((name, index) => makeParticipant(index, name))
      : Array.from({ length: 8 }, (_, index) => makeParticipant(index, `Player ${index + 1}`));
  const startingParticipants = saved?.participants ?? seededParticipants;

  const [title, setTitle] = useState(saved?.title ?? initialTitle ?? "Game Night Tournament");
  const [format, setFormat] = useState<BracketFormat>(saved?.format ?? configuredFormat);
  const [entrantMode] = useState<BracketEntrantMode>(saved?.entrantMode ?? (initialEntrantMode === "TEAM" ? "team" : "player"));
  const [seedingMode, setSeedingMode] = useState<"manual" | "random">(saved?.seedingMode ?? initialSeedingMode.toLowerCase() as "manual" | "random");
  const [participants, setParticipants] = useState<Participant[]>(startingParticipants);
  const [firstRound, setFirstRound] = useState<Pair[]>(saved?.firstRound ?? []);
  const [winners, setWinners] = useState<WinnerMap>(saved?.winners ?? {});
  const [threeWinners, setThreeWinners] = useState<ThreeWinnerMap>(saved?.threeWinners ?? {});
  const [competitionMatches, setCompetitionMatches] = useState<CompetitionMatchSpec[]>(saved?.competitionMatches ?? []);
  const [groups, setGroups] = useState<Record<string, string[]>>(saved?.groups ?? {});
  const [groupCount, setGroupCount] = useState(initialGroupCount);
  const [groupAdvancers, setGroupAdvancers] = useState(saved?.groupAdvancers ?? initialAdvancersPerGroup);
  const [tieBreakMode, setTieBreakMode] = useState<TieBreakMode>(saved?.tieBreakMode ?? initialTieBreakMode);
  const [bracketStatus, setBracketStatus] = useState<BracketStatus>(initialStatus);
  const [bracketUpdatedAt, setBracketUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const bracketLocked = Boolean(eventId && (bracketStatus === "LIVE" || bracketStatus === "COMPLETED"));
  const linkedTeamMode = Boolean(eventId && entrantMode === "team");

  const currentDraft = useMemo<BracketDraft>(() => ({
    version: 2,
    title,
    format,
    seedingMode,
    participants,
    firstRound,
    winners,
    threeWinners,
    competitionMatches,
    groups: Object.keys(groups).length ? groups : undefined,
    groupAdvancers,
    tieBreakMode,
    entrantMode,
  }), [title, format, seedingMode, participants, firstRound, winners, threeWinners, competitionMatches, groups, groupAdvancers, tieBreakMode, entrantMode]);

  const rounds = useMemo(() => deriveSingleElimination(firstRound, winners), [firstRound, winners]);
  const three = useMemo(() => resolveThreePlayerAdvancement(participants, threeWinners), [participants, threeWinners]);
  const expandedMatches = useMemo(() => deriveExpandedCompetitionMatches(currentDraft), [currentDraft]);
  const champion = useMemo(() => bracketChampion(currentDraft), [currentDraft]);
  const roundRobinStandings = useMemo(() => format === "round_robin" ? deriveCompetitionStandings(currentDraft) : null, [format, currentDraft]);
  const groupStandings = useMemo(() => format === "groups" ? Object.keys(groups).sort().map((group) => ({ group, ...deriveCompetitionStandings(currentDraft, group) })) : [], [format, groups, currentDraft]);
  const hasFinalResult = Boolean(champion);

  function clearResultsAndStructure() {
    setFirstRound([]);
    setWinners({});
    setThreeWinners({});
    setCompetitionMatches([]);
    setGroups({});
  }

  function setParticipantCount(nextCount: number) {
    if (bracketLocked || linkedTeamMode) return;
    const count = Math.min(128, Math.max(minimumEntrants(format), nextCount));
    setParticipants((current) => {
      if (current.length === count) return current;
      if (current.length > count) return current.slice(0, count);
      return [...current, ...Array.from({ length: count - current.length }, (_, index) => makeParticipant(current.length + index))];
    });
    clearResultsAndStructure();
  }

  function updateName(id: string, name: string) {
    if (bracketLocked || linkedTeamMode) return;
    setParticipants((current) => current.map((participant) => participant.id === id ? { ...participant, name } : participant));
    setFirstRound((current) => current.map(([a, b]) => [a?.id === id ? { ...a, name } : a, b?.id === id ? { ...b, name } : b]));
  }

  function moveParticipant(index: number, direction: -1 | 1) {
    if (bracketLocked) return;
    const target = index + direction;
    if (target < 0 || target >= participants.length) return;
    const next = [...participants];
    [next[index], next[target]] = [next[target], next[index]];
    setParticipants(next);
    clearResultsAndStructure();
  }

  function generate() {
    if (bracketLocked) return;
    const minimum = minimumEntrants(format);
    if (participants.length < minimum) {
      setMessage(`${expandedFormatLabel(format)} requires at least ${minimum} entrants.`);
      return;
    }
    if (format === "three" && participants.length !== 3) {
      setMessage("Three-player mode requires exactly three entrants.");
      return;
    }
    const cleaned = participants.map((participant, index) => ({ ...participant, name: participant.name.trim() || `Entrant ${index + 1}` }));
    const duplicateName = duplicateParticipantName(cleaned);
    if (duplicateName) {
      clearResultsAndStructure();
      setMessage(`“${duplicateName}” appears more than once. Give every entrant a unique name before generating.`);
      return;
    }

    const placed = seedingMode === "random" ? shuffle(cleaned) : cleaned;
    setParticipants(placed);
    setWinners({});
    setThreeWinners({});
    setFirstRound([]);
    setCompetitionMatches([]);
    setGroups({});
    setMessage("");

    if (format === "single") {
      setFirstRound(buildFirstRound(placed));
    } else if (format === "three") {
      // The custom three-player resolver derives its three matches from entrant order.
    } else if (format === "double") {
      setCompetitionMatches(buildDoubleEliminationCompetition(placed));
    } else if (format === "round_robin") {
      setCompetitionMatches(buildRoundRobinCompetition(placed));
    } else {
      const generated = buildGroupsPlayoffCompetition(placed, groupCount, groupAdvancers);
      setGroups(generated.groups);
      setGroupAdvancers(generated.advancers);
      setCompetitionMatches(generated.matches);
    }
  }

  function chooseSingleWinner(match: DerivedMatch, participant: Participant) {
    if (bracketLocked || !match.a || !match.b || !match.aReady || !match.bReady) return;
    setWinners((current) => ({ ...current, [match.id]: participant.id }));
  }

  function chooseExpandedWinner(match: ResolvedCompetitionMatch, participant: Participant) {
    if (bracketLocked || !match.active || !match.a || !match.b || !match.aReady || !match.bReady) return;
    setWinners((current) => ({ ...current, [match.id]: participant.id }));
  }

  async function saveDraft() {
    if (!eventId) {
      setMessage("This standalone competition can be exported as a PNG. Open it from an event to save and run it through Match Center.");
      return;
    }
    if (bracketStatus === "LIVE") { setMessage("This competition is live. Use Match Center for results, forfeits, disputes, or corrections."); return; }
    if (bracketStatus === "COMPLETED") { setMessage("This competition is completed. Reopen it before editing placement."); return; }
    if (format === "single" && !firstRound.length) { setMessage("Generate the bracket before saving it to the event."); return; }
    if (["double", "round_robin", "groups"].includes(format) && !competitionMatches.length) { setMessage("Generate the competition schedule before saving it."); return; }

    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/bracket`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: draftToDbFormat(format), seedingMode: seedingMode.toUpperCase(), state: currentDraft, expectedUpdatedAt: bracketUpdatedAt }),
      });
      const body = (await response.json()) as { error?: string; status?: BracketStatus; updatedAt?: string };
      if (!response.ok) throw new Error(body.error ?? "The competition could not be saved.");
      if (body.status) setBracketStatus(body.status);
      if (body.updatedAt) setBracketUpdatedAt(body.updatedAt);
      setMessage("Competition saved. Publish it when entrants are ready, then use Match Center for live results.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The competition could not be saved."); }
    finally { setSaving(false); }
  }

  async function changeBracketStatus(status: Exclude<BracketStatus, "DRAFT">) {
    if (!eventId) return;
    if (status === "COMPLETED" && !hasFinalResult) { setMessage("Finish every required match in Match Center before marking the competition completed."); return; }
    if (bracketStatus === "DRAFT") { setMessage("Save the competition before publishing it."); return; }
    setChangingStatus(true); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/bracket`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const body = (await response.json()) as { error?: string; status?: BracketStatus; updatedAt?: string };
      if (!response.ok) throw new Error(body.error ?? "The competition status could not be changed.");
      setBracketStatus(body.status ?? status);
      if (body.updatedAt) setBracketUpdatedAt(body.updatedAt);
      setMessage(status === "LIVE" ? "Competition is live. Match Center now owns all results and corrections." : status === "COMPLETED" ? "Competition completed and locked." : "Competition reopened for setup.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The competition status could not be changed."); }
    finally { setChangingStatus(false); }
  }

  function downloadPng() {
    const error = downloadBracketPng({ draft: currentDraft });
    if (error) setMessage(error);
  }

  const expandedByStage = new Map<string, ResolvedCompetitionMatch[]>();
  for (const match of expandedMatches) {
    const key = match.group ? `${match.stage}:${match.group}:${match.round}` : `${match.stage}:${match.round}`;
    const list = expandedByStage.get(key) ?? [];
    list.push(match);
    expandedByStage.set(key, list);
  }

  return (
    <div className="section-stack">
      {eventId ? <section className={`competitive-status competitive-status-${bracketStatus.toLowerCase()}`}><div><span className="eyebrow">Competition status</span><strong>{bracketStatus.replaceAll("_", " ")}</strong></div><p>{bracketStatus === "DRAFT" ? "Generate and save the competition before publishing it." : bracketStatus === "GENERATED" ? "Saved for staff. Publish it when entrants are ready." : bracketStatus === "LIVE" ? "Live. Match Center owns tournament results and corrections." : "Final results are locked and remain available to view."}</p></section> : null}

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Competition setup</h2><p>Choose the format, seed entrants, generate the schedule, then publish it into Match Center.</p></div>{bracketLocked ? <span className="badge">{bracketStatus === "LIVE" ? "Live · Match Center" : "Locked"}</span> : null}</div>
        <div className="two-column">
          <div className="form-stack compact"><label htmlFor="bracket-title">Competition title</label><input id="bracket-title" value={title} disabled={bracketLocked} onChange={(event) => setTitle(event.target.value)} maxLength={100} /></div>
          <div className="form-stack compact"><label htmlFor="bracket-format">Format</label><select id="bracket-format" value={format} disabled={bracketLocked || Boolean(eventId)} onChange={(event) => { const next = event.target.value as BracketFormat; setFormat(next); clearResultsAndStructure(); if (next === "three") setParticipantCount(3); }}><option value="single">Single elimination</option><option value="double">Double elimination</option><option value="round_robin">Round robin</option><option value="groups">Groups → playoffs</option><option value="three">Three-player custom advancement</option></select>{eventId ? <span className="field-help">Change event format from Edit Event before generation.</span> : null}</div>
        </div>
        <div className="two-column">
          <div className="form-stack compact"><label htmlFor="participant-count">Number of {entrantMode === "team" ? "teams" : "participants"}</label><input id="participant-count" type="number" min={minimumEntrants(format)} max={format === "three" ? 3 : 128} value={participants.length} disabled={bracketLocked || format === "three" || linkedTeamMode} onChange={(event) => setParticipantCount(Number(event.target.value))} />{linkedTeamMode ? <span className="field-help">Team entrants come from event team registration.</span> : null}</div>
          <div className="form-stack compact"><label htmlFor="placement-mode">Placement</label><select id="placement-mode" value={seedingMode} disabled={bracketLocked || Boolean(eventId)} onChange={(event) => setSeedingMode(event.target.value as "manual" | "random")}><option value="random">System chooses randomly</option><option value="manual">Host uses the order below</option></select></div>
        </div>
        {format === "groups" ? <div className="two-column"><div className="form-stack compact"><label htmlFor="generator-groups">Groups</label><input id="generator-groups" type="number" min={2} max={16} value={groupCount} disabled={bracketLocked || Boolean(eventId)} onChange={(event) => { setGroupCount(Math.max(2, Math.min(16, Number(event.target.value) || 2))); clearResultsAndStructure(); }} /></div><div className="form-stack compact"><label htmlFor="generator-advancers">Advance per group</label><input id="generator-advancers" type="number" min={1} max={8} value={groupAdvancers} disabled={bracketLocked || Boolean(eventId)} onChange={(event) => { setGroupAdvancers(Math.max(1, Math.min(8, Number(event.target.value) || 1))); clearResultsAndStructure(); }} /></div></div> : null}
        {(format === "groups" || format === "round_robin") ? <div className="form-stack compact"><label htmlFor="generator-tiebreak">Standings tiebreak</label><select id="generator-tiebreak" value={tieBreakMode} disabled={bracketLocked || Boolean(eventId)} onChange={(event) => setTieBreakMode(event.target.value as TieBreakMode)}><option value="HEAD_TO_HEAD_THEN_SEED">Head-to-head, then original seed</option><option value="SEED">Original seed/order</option></select></div> : null}

        <div className="participant-editor">
          {participants.map((participant, index) => <div className="participant-input-row" key={participant.id}><span className="participant-number">{format === "three" ? ["A", "B", "C"][index] : index + 1}</span><input aria-label={`Entrant ${index + 1}`} value={participant.name} disabled={bracketLocked || linkedTeamMode} onChange={(event) => updateName(participant.id, event.target.value)} maxLength={120} />{participant.entrantType === "team" ? <span className="badge">Team · {participant.roster?.length ?? 0} rostered</span> : null}{seedingMode === "manual" ? <div className="order-buttons"><button className="button button-secondary" type="button" disabled={bracketLocked || index === 0} onClick={() => moveParticipant(index, -1)}>↑</button><button className="button button-secondary" type="button" disabled={bracketLocked || index === participants.length - 1} onClick={() => moveParticipant(index, 1)}>↓</button></div> : null}</div>)}
        </div>

        {format === "three" ? <div className="rule-callout"><strong>Three-entrant advancement order</strong><p>Match 1 is A vs B. Match 2 is C vs the Match 1 loser. Match 3 is C vs the Match 1 winner. There are no rematches, and the custom advancement rule is applied automatically.</p></div> : null}
        {format === "double" ? <div className="rule-callout"><strong>Double elimination</strong><p>Entrants move through winners and losers brackets. The grand final automatically adds a reset match only if the lower-bracket finalist hands the undefeated finalist their first loss.</p></div> : null}
        {format === "groups" ? <div className="rule-callout"><strong>Groups → playoffs</strong><p>Entrants are distributed in serpentine seed order. Each group plays round robin, standings resolve by {tieBreakMode === "HEAD_TO_HEAD_THEN_SEED" ? "head-to-head then seed" : "original seed"}, and the top {groupAdvancers} from each group feed the playoff bracket.</p></div> : null}

        <div className="button-row"><button className="button" type="button" onClick={generate} disabled={bracketLocked}>Generate competition</button><button className="button button-secondary" type="button" onClick={saveDraft} disabled={saving || bracketLocked}>{saving ? "Saving…" : eventId ? "Save competition" : "Save draft"}</button><button className="button button-secondary" type="button" onClick={downloadPng}>Download PNG</button>{eventId && bracketStatus === "GENERATED" ? <button className="button" type="button" disabled={changingStatus} onClick={() => changeBracketStatus("LIVE")}>Publish live</button> : null}{eventId && bracketStatus === "LIVE" ? <><a className="button button-secondary" href={`/dashboard/events/${eventId}/matches`}>Open Match Center</a><button className="button" type="button" disabled={changingStatus || !hasFinalResult} onClick={() => changeBracketStatus("COMPLETED")}>Mark completed</button></> : null}{eventId && bracketStatus === "COMPLETED" ? <button className="button button-secondary" type="button" disabled={changingStatus} onClick={() => changeBracketStatus("GENERATED")}>Reopen competition</button> : null}</div>
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </section>

      {format === "single" && rounds.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Single-elimination bracket</h2><p>Select winners during setup. After publishing live, Match Center becomes the only result path.</p></div>{champion ? <span className="badge">Champion: {champion.name}</span> : null}</div><div className="bracket-scroll"><div className="bracket-rounds" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))` }}>{rounds.map((round, roundIndex) => <div className="bracket-round" key={`round-${roundIndex}`}><h3>{roundIndex === rounds.length - 1 ? "Final" : `Round ${roundIndex + 1}`}</h3><div className="round-matches">{round.map((match) => <article className="match-card" key={match.id}>{[match.a, match.b].map((participant, slot) => { const slotName = slot === 0 ? "a" : "b"; const isWinner = participant && match.winner?.id === participant.id; const selectable = Boolean(match.a && match.b && match.aReady && match.bReady); return <button className={`match-participant${isWinner ? " winner" : ""}${!participant ? " bye" : ""}`} key={`${match.id}-${slot}`} type="button" disabled={bracketLocked || !participant || !selectable} onClick={() => participant && chooseSingleWinner(match, participant)}><span>{participant?.name ?? getMatchSlotLabel(match, slotName)}</span>{isWinner ? <strong>Winner</strong> : null}</button>; })}</article>)}</div></div>)}</div></div></section> : null}

      {format === "three" && participants.length === 3 ? <section className="panel section-stack"><div className="section-header"><div><h2>Three-player bracket</h2><p>Select setup winners in order. Live results move to Match Center.</p></div>{three.champion ? <span className="badge">Advances: {three.champion.name}</span> : null}</div><div className="three-match-grid"><ThreeMatch label="Match 1" a={three.playerA} b={three.playerB} winner={three.m1Winner} disabled={bracketLocked} onChoose={(participant) => setThreeWinners({ m1: participant.id })} /><ThreeMatch label="Match 2" a={three.playerC} b={three.m1Loser} winner={three.m2Winner} disabled={bracketLocked} onChoose={(participant) => setThreeWinners((current) => ({ m1: current.m1, m2: participant.id }))} /><ThreeMatch label="Match 3" a={three.playerC} b={three.m1Winner} winner={three.m3Winner} disabled={bracketLocked} onChoose={(participant) => setThreeWinners((current) => ({ ...current, m3: participant.id }))} /></div><div className="rule-callout"><strong>{three.champion ? `${three.champion.name} advances` : "Advancement pending"}</strong><p>{three.reason}</p></div></section> : null}

      {format === "round_robin" && competitionMatches.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Round-robin standings</h2><p>Every entrant plays every other entrant once.</p></div>{champion ? <span className="badge">Winner: {champion.name}</span> : <span className="badge">{roundRobinStandings?.rows.length ?? 0} entrants</span>}</div>{roundRobinStandings ? <div className="standings-list">{roundRobinStandings.rows.map((row, index) => <div className="standing-row" key={row.participant.id}><span>#{index + 1}</span><strong>{row.participant.name}</strong><span>{row.wins} W · {row.losses} L</span></div>)}</div> : null}</section> : null}

      {format === "groups" && groupStandings.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Group standings</h2><p>Top {groupAdvancers} from each group advance into the playoff bracket once group play is complete.</p></div>{champion ? <span className="badge">Champion: {champion.name}</span> : null}</div><div className="dashboard-grid">{groupStandings.map(({ group, rows: standingRows, complete }) => <article className="subpanel section-stack" key={group}><div className="section-header"><h3>Group {group}</h3><span className="badge">{complete ? "Complete" : "In progress"}</span></div><div className="standings-list">{standingRows.map((row, index) => <div className="standing-row" key={row.participant.id}><span>#{index + 1}</span><strong>{row.participant.name}</strong><span>{row.wins} W · {row.losses} L</span></div>)}</div></article>)}</div></section> : null}

      {["double", "round_robin", "groups"].includes(format) && expandedMatches.length ? <section className="panel section-stack"><div className="section-header"><div><h2>{expandedFormatLabel(format)} matches</h2><p>{bracketLocked ? "Results are read-only here while live. Use Match Center for tournament operations." : "Select setup winners to preview advancement, or leave results empty and run everything from Match Center after publishing."}</p></div>{champion ? <span className="badge">Champion: {champion.name}</span> : null}</div><div className="expanded-stage-stack">{[...expandedByStage.entries()].map(([key, matches]) => <section className="competition-stage" key={key}><div className="section-header"><h3>{matches[0]?.label ?? key}</h3>{matches[0]?.group ? <span className="badge">Group {matches[0].group}</span> : null}</div><div className="round-matches expanded-round-matches">{matches.map((match) => <ExpandedMatchCard key={match.id} match={match} locked={bracketLocked} onChoose={chooseExpandedWinner} />)}</div></section>)}</div></section> : null}
    </div>
  );
}
