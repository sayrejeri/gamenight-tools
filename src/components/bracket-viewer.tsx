import {
  bracketChampion,
  deriveCompetitionStandings,
  deriveExpandedCompetitionMatches,
  deriveSingleElimination,
  expandedFormatLabel,
  getMatchSlotLabel,
  isDraft,
  resolveThreePlayerAdvancement,
  type ResolvedCompetitionMatch,
} from "@/components/bracket/bracket-model";
import { ThreeMatch } from "@/components/bracket/three-match";

function ReadOnlyMatch({ match }: { match: ResolvedCompetitionMatch }) {
  return (
    <article className={`match-card expanded-match-card${!match.active ? " match-inactive" : ""}`}>
      <div className="match-card-heading"><span>{match.label}</span>{match.group ? <span className="badge">Group {match.group}</span> : null}</div>
      {[match.a, match.b].map((participant, slot) => {
        const winner = participant && match.winner?.id === participant.id;
        return <div className={`match-participant${winner ? " winner" : ""}${!participant ? " bye" : ""}`} key={`${match.id}-${slot}`}><span>{participant?.name ?? (match.active && (slot === 0 ? match.aReady : match.bReady) ? "BYE" : "TBD")}</span>{winner ? <strong>Winner</strong> : null}</div>;
      })}
      {!match.active ? <span className="field-help">Reset match only if required.</span> : null}
    </article>
  );
}

export function BracketViewer({ state, status }: { state: unknown; status: string }) {
  if (!isDraft(state)) return <div className="empty-state">This competition does not have a readable saved state yet.</div>;

  if (state.format === "three") {
    const result = resolveThreePlayerAdvancement(state.participants, state.threeWinners);
    return (
      <div className="section-stack">
        <div className="section-header"><div><span className="eyebrow">{status}</span><h2>{state.title}</h2><p>Three-player advancement · {state.seedingMode} placement</p></div>{result.champion ? <span className="badge">Advances: {result.champion.name}</span> : <span className="badge">In progress</span>}</div>
        <div className="three-match-grid"><ThreeMatch label="Match 1" a={result.playerA} b={result.playerB} winner={result.m1Winner} readOnly /><ThreeMatch label="Match 2" a={result.playerC} b={result.m1Loser} winner={result.m2Winner} readOnly /><ThreeMatch label="Match 3" a={result.playerC} b={result.m1Winner} winner={result.m3Winner} readOnly /></div>
        <div className="rule-callout"><strong>{result.champion ? `${result.champion.name} advances` : "Advancement pending"}</strong><p>{result.reason}</p><p><b>No rematches.</b> The A/B/C assignment controls the matchup order.</p></div>
      </div>
    );
  }

  if (state.format === "single") {
    const rounds = deriveSingleElimination(state.firstRound, state.winners);
    const champion = rounds.at(-1)?.[0]?.winner ?? null;
    return (
      <div className="section-stack">
        <div className="section-header"><div><span className="eyebrow">{status}</span><h2>{state.title}</h2><p>Single elimination · {state.seedingMode} placement</p></div>{champion ? <span className="badge">Champion: {champion.name}</span> : <span className="badge">In progress</span>}</div>
        {rounds.length ? <div className="bracket-scroll"><div className="bracket-rounds" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))` }}>{rounds.map((round, roundIndex) => <div className="bracket-round" key={`round-${roundIndex}`}><h3>{roundIndex === rounds.length - 1 ? "Final" : `Round ${roundIndex + 1}`}</h3><div className="round-matches">{round.map((match) => <article className="match-card" key={match.id}>{[match.a, match.b].map((participant, slot) => { const slotName = slot === 0 ? "a" : "b"; const isWinner = participant && match.winner?.id === participant.id; return <div className={`match-participant${isWinner ? " winner" : ""}${!participant ? " bye" : ""}`} key={`${match.id}-${slot}`}><span>{participant?.name ?? getMatchSlotLabel(match, slotName)}</span>{isWinner ? <strong>Winner</strong> : null}</div>; })}</article>)}</div></div>)}</div></div> : <div className="empty-state">The bracket has not been generated yet.</div>}
      </div>
    );
  }

  const matches = deriveExpandedCompetitionMatches(state);
  const champion = bracketChampion(state);
  const sections = new Map<string, ResolvedCompetitionMatch[]>();
  for (const match of matches) {
    const key = match.group ? `${match.stage}:${match.group}:${match.round}` : `${match.stage}:${match.round}`;
    const list = sections.get(key) ?? [];
    list.push(match);
    sections.set(key, list);
  }
  const roundRobin = state.format === "round_robin" ? deriveCompetitionStandings(state) : null;
  const groupStandings = state.format === "groups" ? Object.keys(state.groups ?? {}).sort().map((group) => ({ group, ...deriveCompetitionStandings(state, group) })) : [];

  return (
    <div className="section-stack">
      <div className="section-header"><div><span className="eyebrow">{status}</span><h2>{state.title}</h2><p>{expandedFormatLabel(state.format)} · {state.entrantMode === "team" ? "team" : "player"} entrants · {state.seedingMode} placement</p></div>{champion ? <span className="badge">Champion: {champion.name}</span> : <span className="badge">In progress</span>}</div>

      {roundRobin ? <section className="subpanel section-stack"><div className="section-header"><h3>Standings</h3><span className="badge">{roundRobin.complete ? "Complete" : "Live"}</span></div><div className="standings-list">{roundRobin.rows.map((row, index) => <div className="standing-row" key={row.participant.id}><span>#{index + 1}</span><strong>{row.participant.name}</strong><span>{row.wins} W · {row.losses} L</span></div>)}</div></section> : null}

      {groupStandings.length ? <div className="dashboard-grid">{groupStandings.map(({ group, rows, complete }) => <section className="subpanel section-stack" key={group}><div className="section-header"><h3>Group {group}</h3><span className="badge">{complete ? "Complete" : "Live"}</span></div><div className="standings-list">{rows.map((row, index) => <div className="standing-row" key={row.participant.id}><span>#{index + 1}</span><strong>{row.participant.name}</strong><span>{row.wins} W · {row.losses} L</span></div>)}</div></section>)}</div> : null}

      <div className="expanded-stage-stack">{[...sections.entries()].map(([key, stageMatches]) => <section className="competition-stage" key={key}><div className="section-header"><h3>{stageMatches[0]?.label ?? key}</h3>{stageMatches[0]?.group ? <span className="badge">Group {stageMatches[0].group}</span> : null}</div><div className="round-matches expanded-round-matches">{stageMatches.map((match) => <ReadOnlyMatch key={match.id} match={match} />)}</div></section>)}</div>
    </div>
  );
}
