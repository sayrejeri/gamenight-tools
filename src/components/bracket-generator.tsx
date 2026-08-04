"use client";

import { useMemo, useState } from "react";
import {
  buildFirstRound,
  deriveSingleElimination,
  isDraft,
  makeParticipant,
  shuffle,
  type BracketDraft,
  type DerivedMatch,
  type Pair,
  type Participant,
  type ThreeWinnerMap,
  type WinnerMap,
} from "@/components/bracket/bracket-model";
import { downloadBracketPng } from "@/components/bracket/bracket-export";
import { ThreeMatch } from "@/components/bracket/three-match";

export function BracketGenerator({
  eventId,
  initialTitle,
  initialNames,
  initialDraft,
}: {
  eventId?: string;
  initialTitle?: string;
  initialNames?: string[];
  initialDraft?: unknown;
}) {
  const saved = isDraft(initialDraft) ? initialDraft : null;
  const seededNames = initialNames?.length ? initialNames : Array.from({ length: 8 }, (_, index) => `Player ${index + 1}`);
  const initialParticipants = saved?.participants ?? seededNames.map((name, index) => makeParticipant(index, name));

  const [title, setTitle] = useState(saved?.title ?? initialTitle ?? "Game Night Tournament");
  const [format, setFormat] = useState<"single" | "three">(saved?.format ?? "single");
  const [seedingMode, setSeedingMode] = useState<"manual" | "random">(saved?.seedingMode ?? "random");
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [firstRound, setFirstRound] = useState<Pair[]>(saved?.firstRound ?? []);
  const [winners, setWinners] = useState<WinnerMap>(saved?.winners ?? {});
  const [threeWinners, setThreeWinners] = useState<ThreeWinnerMap>(saved?.threeWinners ?? {});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const rounds = useMemo(() => deriveSingleElimination(firstRound, winners), [firstRound, winners]);
  const champion = rounds.at(-1)?.[0]?.winner ?? null;

  const activeThree = participants.slice(0, 3);
  const [playerA, playerB, playerC] = activeThree;
  const m1Winner = activeThree.find((player) => player.id === threeWinners.m1) ?? null;
  const m1Loser = m1Winner ? (m1Winner.id === playerA?.id ? playerB : playerA) : null;
  const m2Winner = [playerC, m1Loser].find((player) => player?.id === threeWinners.m2) ?? null;
  const m3Winner = [playerC, m1Winner].find((player) => player?.id === threeWinners.m3) ?? null;
  let threeChampion: Participant | null = null;
  let threeReason = "Complete all three matches to calculate who advances.";

  if (m1Winner && m1Loser && m2Winner && m3Winner && playerC) {
    if (m2Winner.id === playerC.id) {
      threeChampion = m3Winner;
      threeReason = `${m1Loser.name} lost both opening matches. The winner of ${m1Winner.name} vs ${playerC.name} advances.`;
    } else if (m3Winner.id === playerC.id) {
      threeChampion = playerC;
      threeReason = `${playerC.name} defeated the first-match winner, so ${playerC.name} advances under the three-player rule.`;
    } else {
      threeChampion = m1Loser;
      threeReason = `${m1Winner.name} won the final listed match, so ${m1Loser.name} advances under the event's custom overall-result rule.`;
    }
  }

  function setParticipantCount(nextCount: number) {
    const count = Math.min(128, Math.max(format === "three" ? 3 : 2, nextCount));
    setParticipants((current) => {
      if (current.length === count) return current;
      if (current.length > count) return current.slice(0, count);
      return [
        ...current,
        ...Array.from({ length: count - current.length }, (_, index) => makeParticipant(current.length + index)),
      ];
    });
    setFirstRound([]);
    setWinners({});
    setThreeWinners({});
  }

  function updateName(id: string, name: string) {
    setParticipants((current) => current.map((participant) => participant.id === id ? { ...participant, name } : participant));
    setFirstRound((current) => current.map(([a, b]) => [
      a?.id === id ? { ...a, name } : a,
      b?.id === id ? { ...b, name } : b,
    ]));
  }

  function moveParticipant(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= participants.length) return;
    const next = [...participants];
    [next[index], next[target]] = [next[target], next[index]];
    setParticipants(next);
    setFirstRound([]);
    setWinners({});
    setThreeWinners({});
  }

  function generate() {
    const cleaned = participants.map((participant, index) => ({
      ...participant,
      name: participant.name.trim() || `Player ${index + 1}`,
    }));
    const placed = seedingMode === "random" ? shuffle(cleaned) : cleaned;
    setParticipants(placed);
    setWinners({});
    setThreeWinners({});
    setMessage("");

    if (format === "three") {
      if (placed.length !== 3) {
        setParticipantCount(3);
        setMessage("Three-player mode requires exactly three participants.");
        return;
      }
      setFirstRound([]);
      return;
    }

    setFirstRound(buildFirstRound(placed));
  }

  function chooseWinner(match: DerivedMatch, participant: Participant) {
    if (!match.a || !match.b) return;
    setWinners((current) => ({ ...current, [match.id]: participant.id }));
  }

  function currentDraft(): BracketDraft {
    return {
      version: 1,
      title,
      format,
      seedingMode,
      participants,
      firstRound,
      winners,
      threeWinners,
    };
  }

  async function saveDraft() {
    if (!eventId) {
      setMessage("This standalone bracket can be exported as a PNG. Open it from an event to share a saved draft with co-hosts.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/bracket`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: format === "single" ? "SINGLE_ELIMINATION" : "THREE_PLAYER",
          seedingMode: seedingMode.toUpperCase(),
          state: currentDraft(),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The bracket could not be saved.");
      setMessage("Bracket draft saved. Co-hosts with bracket permission can open the same event and continue it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The bracket could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function downloadPng() {
    const error = downloadBracketPng({
      title,
      format,
      seedingMode,
      participants,
      rounds,
      champion,
      playerA,
      playerB,
      playerC,
      m1Winner,
      m1Loser,
      m2Winner,
      m3Winner,
      threeChampion,
      threeReason,
    });
    if (error) setMessage(error);
  }

  return (
    <div className="section-stack">
      <section className="panel section-stack">
        <div className="section-header">
          <div>
            <h2>Bracket setup</h2>
            <p>Enter participant names, choose host placement or random placement, and generate the bracket.</p>
          </div>
        </div>

        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="bracket-title">Bracket title</label>
            <input id="bracket-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
          </div>
          <div className="form-stack compact">
            <label htmlFor="bracket-format">Format</label>
            <select
              id="bracket-format"
              value={format}
              onChange={(event) => {
                const next = event.target.value as "single" | "three";
                setFormat(next);
                if (next === "three") setParticipantCount(3);
                setFirstRound([]);
                setWinners({});
                setThreeWinners({});
              }}
            >
              <option value="single">Single elimination</option>
              <option value="three">Three-player advancement rule</option>
            </select>
          </div>
        </div>

        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="participant-count">Number of participants</label>
            <input
              id="participant-count"
              type="number"
              min={format === "three" ? 3 : 2}
              max={format === "three" ? 3 : 128}
              value={participants.length}
              disabled={format === "three"}
              onChange={(event) => setParticipantCount(Number(event.target.value))}
            />
          </div>
          <div className="form-stack compact">
            <label htmlFor="placement-mode">Placement</label>
            <select id="placement-mode" value={seedingMode} onChange={(event) => setSeedingMode(event.target.value as "manual" | "random")}>
              <option value="random">System chooses randomly</option>
              <option value="manual">Host chooses using the order below</option>
            </select>
          </div>
        </div>

        <div className="participant-editor">
          {participants.map((participant, index) => (
            <div className="participant-input-row" key={participant.id}>
              <span className="participant-number">{format === "three" ? ["A", "B", "C"][index] : index + 1}</span>
              <input
                aria-label={`Participant ${index + 1}`}
                value={participant.name}
                onChange={(event) => updateName(participant.id, event.target.value)}
                maxLength={80}
              />
              {seedingMode === "manual" ? (
                <div className="order-buttons">
                  <button className="button button-secondary" type="button" disabled={index === 0} onClick={() => moveParticipant(index, -1)} aria-label={`Move ${participant.name} up`}>↑</button>
                  <button className="button button-secondary" type="button" disabled={index === participants.length - 1} onClick={() => moveParticipant(index, 1)} aria-label={`Move ${participant.name} down`}>↓</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {format === "three" ? (
          <div className="rule-callout">
            <strong>Three-player advancement order</strong>
            <p>
              Match 1 is A vs B. Match 2 is C vs the Match 1 loser. There are no rematches.
              Match 3 is C vs the Match 1 winner. The website then applies the custom overall-result rule automatically.
              The host controls who is assigned A, B, and C, and that assignment decides the matchup order.
            </p>
          </div>
        ) : null}

        <div className="button-row">
          <button className="button" type="button" onClick={generate}>Generate bracket</button>
          <button className="button button-secondary" type="button" onClick={saveDraft} disabled={saving}>{saving ? "Saving…" : eventId ? "Save shared draft" : "Save draft"}</button>
          <button className="button button-secondary" type="button" onClick={downloadPng}>Download PNG</button>
        </div>
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </section>

      {format === "single" && rounds.length ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Single-elimination bracket</h2>
              <p>Select each match winner to advance them automatically. Byes advance without a selection.</p>
            </div>
            {champion ? <span className="badge">Champion: {champion.name}</span> : null}
          </div>
          <div className="bracket-scroll">
            <div className="bracket-rounds" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))` }}>
              {rounds.map((round, roundIndex) => (
                <div className="bracket-round" key={`round-${roundIndex}`}>
                  <h3>{roundIndex === rounds.length - 1 ? "Final" : `Round ${roundIndex + 1}`}</h3>
                  <div className="round-matches">
                    {round.map((match) => (
                      <article className="match-card" key={match.id}>
                        {[match.a, match.b].map((participant, slot) => {
                          const isWinner = participant && match.winner?.id === participant.id;
                          const isSelectable = Boolean(match.a && match.b);
                          return (
                            <button
                              className={`match-participant${isWinner ? " winner" : ""}${!participant ? " bye" : ""}`}
                              key={`${match.id}-${slot}`}
                              type="button"
                              disabled={!participant || !isSelectable}
                              onClick={() => participant && chooseWinner(match, participant)}
                            >
                              <span>{participant?.name ?? "BYE"}</span>
                              {isWinner ? <strong>Winner</strong> : null}
                            </button>
                          );
                        })}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {format === "three" && activeThree.length === 3 ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Three-player bracket</h2>
              <p>Select the winner of each available match in order.</p>
            </div>
            {threeChampion ? <span className="badge">Advances: {threeChampion.name}</span> : null}
          </div>

          <div className="three-match-grid">
            <ThreeMatch
              label="Match 1"
              a={playerA}
              b={playerB}
              winner={m1Winner}
              onChoose={(participant) => setThreeWinners({ m1: participant.id })}
            />
            <ThreeMatch
              label="Match 2"
              a={playerC}
              b={m1Loser}
              winner={m2Winner}
              onChoose={(participant) => setThreeWinners((current) => ({ m1: current.m1, m2: participant.id }))}
            />
            <ThreeMatch
              label="Match 3"
              a={playerC}
              b={m1Winner}
              winner={m3Winner}
              onChoose={(participant) => setThreeWinners((current) => ({ ...current, m3: participant.id }))}
            />
          </div>

          <div className="rule-callout">
            <strong>{threeChampion ? `${threeChampion.name} advances` : "Advancement pending"}</strong>
            <p>{threeReason}</p>
            <p><b>No rematches.</b> Matching and A/B/C placement are decided by the host, with no exceptions.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
