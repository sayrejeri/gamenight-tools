import {
  deriveSingleElimination,
  getMatchSlotLabel,
  isDraft,
  resolveThreePlayerAdvancement,
} from "@/components/bracket/bracket-model";
import { ThreeMatch } from "@/components/bracket/three-match";

export function BracketViewer({ state, status }: { state: unknown; status: string }) {
  if (!isDraft(state)) return <div className="empty-state">This bracket does not have a readable saved state yet.</div>;

  if (state.format === "three") {
    const result = resolveThreePlayerAdvancement(state.participants, state.threeWinners);
    return (
      <div className="section-stack">
        <div className="section-header">
          <div><span className="eyebrow">{status}</span><h2>{state.title}</h2><p>Three-player advancement · {state.seedingMode} placement</p></div>
          {result.champion ? <span className="badge">Advances: {result.champion.name}</span> : <span className="badge">In progress</span>}
        </div>
        <div className="three-match-grid">
          <ThreeMatch label="Match 1" a={result.playerA} b={result.playerB} winner={result.m1Winner} readOnly />
          <ThreeMatch label="Match 2" a={result.playerC} b={result.m1Loser} winner={result.m2Winner} readOnly />
          <ThreeMatch label="Match 3" a={result.playerC} b={result.m1Winner} winner={result.m3Winner} readOnly />
        </div>
        <div className="rule-callout">
          <strong>{result.champion ? `${result.champion.name} advances` : "Advancement pending"}</strong>
          <p>{result.reason}</p>
          <p><b>No rematches.</b> The A/B/C assignment controls the matchup order.</p>
        </div>
      </div>
    );
  }

  const rounds = deriveSingleElimination(state.firstRound, state.winners);
  const champion = rounds.at(-1)?.[0]?.winner ?? null;
  return (
    <div className="section-stack">
      <div className="section-header">
        <div><span className="eyebrow">{status}</span><h2>{state.title}</h2><p>Single elimination · {state.seedingMode} placement</p></div>
        {champion ? <span className="badge">Champion: {champion.name}</span> : <span className="badge">In progress</span>}
      </div>
      {rounds.length ? (
        <div className="bracket-scroll">
          <div className="bracket-rounds" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))` }}>
            {rounds.map((round, roundIndex) => (
              <div className="bracket-round" key={`round-${roundIndex}`}>
                <h3>{roundIndex === rounds.length - 1 ? "Final" : `Round ${roundIndex + 1}`}</h3>
                <div className="round-matches">
                  {round.map((match) => (
                    <article className="match-card" key={match.id}>
                      {[match.a, match.b].map((participant, slot) => {
                        const slotName = slot === 0 ? "a" : "b";
                        const isWinner = participant && match.winner?.id === participant.id;
                        return (
                          <div className={`match-participant${isWinner ? " winner" : ""}${!participant ? " bye" : ""}`} key={`${match.id}-${slot}`}>
                            <span>{participant?.name ?? getMatchSlotLabel(match, slotName)}</span>
                            {isWinner ? <strong>Winner</strong> : null}
                          </div>
                        );
                      })}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : <div className="empty-state">The bracket has not been generated yet.</div>}
    </div>
  );
}
