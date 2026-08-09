"use client";

import { useMemo, useState } from "react";
import {
  buildFirstRound,
  deriveSingleElimination,
  getMatchSlotLabel,
  isDraft,
  makeParticipant,
  resolveThreePlayerAdvancement,
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

export type BracketStatus = "DRAFT" | "GENERATED" | "LIVE" | "COMPLETED";

function duplicateParticipantName(participants: Participant[]): string | null {
  const seen = new Set<string>();
  for (const participant of participants) {
    const normalized = participant.name.trim().toLocaleLowerCase();
    if (seen.has(normalized)) return participant.name.trim();
    seen.add(normalized);
  }
  return null;
}

export function BracketGenerator({
  eventId,
  initialTitle,
  initialNames,
  initialParticipants,
  initialDraft,
  initialStatus = "DRAFT",
  initialUpdatedAt = null,
}: {
  eventId?: string;
  initialTitle?: string;
  initialNames?: string[];
  initialParticipants?: Participant[];
  initialDraft?: unknown;
  initialStatus?: BracketStatus;
  initialUpdatedAt?: string | null;
}) {
  const saved = isDraft(initialDraft) ? initialDraft : null;
  const seededParticipants = initialParticipants?.length
    ? initialParticipants
    : initialNames?.length
      ? initialNames.map((name, index) => makeParticipant(index, name))
      : Array.from({ length: 8 }, (_, index) => makeParticipant(index, `Player ${index + 1}`));
  const startingParticipants = saved?.participants ?? seededParticipants;

  const [title, setTitle] = useState(saved?.title ?? initialTitle ?? "Game Night Tournament");
  const [format, setFormat] = useState<"single" | "three">(saved?.format ?? "single");
  const [seedingMode, setSeedingMode] = useState<"manual" | "random">(saved?.seedingMode ?? "random");
  const [participants, setParticipants] = useState<Participant[]>(startingParticipants);
  const [firstRound, setFirstRound] = useState<Pair[]>(saved?.firstRound ?? []);
  const [winners, setWinners] = useState<WinnerMap>(saved?.winners ?? {});
  const [threeWinners, setThreeWinners] = useState<ThreeWinnerMap>(saved?.threeWinners ?? {});
  const [bracketStatus, setBracketStatus] = useState<BracketStatus>(initialStatus);
  const [bracketUpdatedAt, setBracketUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const rounds = useMemo(() => deriveSingleElimination(firstRound, winners), [firstRound, winners]);
  const champion = rounds.at(-1)?.[0]?.winner ?? null;
  const three = useMemo(() => resolveThreePlayerAdvancement(participants, threeWinners), [participants, threeWinners]);
  const { playerA, playerB, playerC, m1Winner, m1Loser, m2Winner, m3Winner, champion: threeChampion, reason: threeReason } = three;
  const bracketLocked = Boolean(eventId && (bracketStatus === "LIVE" || bracketStatus === "COMPLETED"));
  const hasFinalResult = format === "single" ? Boolean(champion) : Boolean(threeChampion);

  function clearResults() {
    setFirstRound([]);
    setWinners({});
    setThreeWinners({});
  }

  function setParticipantCount(nextCount: number) {
    if (bracketLocked) return;
    const count = Math.min(128, Math.max(format === "three" ? 3 : 2, nextCount));
    setParticipants((current) => {
      if (current.length === count) return current;
      if (current.length > count) return current.slice(0, count);
      return [
        ...current,
        ...Array.from({ length: count - current.length }, (_, index) => makeParticipant(current.length + index)),
      ];
    });
    clearResults();
  }

  function updateName(id: string, name: string) {
    if (bracketLocked) return;
    setParticipants((current) => current.map((participant) => participant.id === id ? { ...participant, name } : participant));
    setFirstRound((current) => current.map(([a, b]) => [
      a?.id === id ? { ...a, name } : a,
      b?.id === id ? { ...b, name } : b,
    ]));
  }

  function moveParticipant(index: number, direction: -1 | 1) {
    if (bracketLocked) return;
    const target = index + direction;
    if (target < 0 || target >= participants.length) return;
    const next = [...participants];
    [next[index], next[target]] = [next[target], next[index]];
    setParticipants(next);
    clearResults();
  }

  function generate() {
    if (bracketLocked) return;
    const cleaned = participants.map((participant, index) => ({
      ...participant,
      name: participant.name.trim() || `Player ${index + 1}`,
    }));
    const duplicateName = duplicateParticipantName(cleaned);
    if (duplicateName) {
      clearResults();
      setMessage(`“${duplicateName}” appears more than once. Give every participant a unique name before generating the bracket.`);
      return;
    }

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
    if (bracketLocked || !match.a || !match.b || !match.aReady || !match.bReady) return;
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
      setMessage("This standalone bracket can be exported as a PNG. Open it from an event to share a saved bracket with co-hosts.");
      return;
    }
    if (bracketStatus === "LIVE") {
      setMessage("This bracket is live. Use Match Center for results, forfeits, disputes, or corrections.");
      return;
    }
    if (bracketStatus === "COMPLETED") {
      setMessage("This bracket is completed. Reopen it before editing placement.");
      return;
    }
    if (format === "single" && !firstRound.length) {
      setMessage("Generate the bracket before saving it to the event.");
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
          expectedUpdatedAt: bracketUpdatedAt,
        }),
      });
      const body = (await response.json()) as { error?: string; status?: BracketStatus; updatedAt?: string };
      if (!response.ok) throw new Error(body.error ?? "The bracket could not be saved.");
      if (body.status) setBracketStatus(body.status);
      if (body.updatedAt) setBracketUpdatedAt(body.updatedAt);
      setMessage("Bracket saved. Co-hosts with bracket permission can continue it from this event.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The bracket could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeBracketStatus(status: Exclude<BracketStatus, "DRAFT">) {
    if (!eventId) return;
    if (status === "COMPLETED" && !hasFinalResult) {
      setMessage("Finish every required match in Match Center before marking the bracket completed.");
      return;
    }
    if (bracketStatus === "DRAFT") {
      setMessage("Save the bracket before publishing it.");
      return;
    }

    setChangingStatus(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/bracket`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await response.json()) as { error?: string; status?: BracketStatus; updatedAt?: string };
      if (!response.ok) throw new Error(body.error ?? "The bracket status could not be changed.");
      setBracketStatus(body.status ?? status);
      if (body.updatedAt) setBracketUpdatedAt(body.updatedAt);
      setMessage(status === "LIVE"
        ? "Bracket is live. Use Match Center to run matches and record every result."
        : status === "COMPLETED"
          ? "Bracket completed and locked. Reopen it if placement needs to be prepared again."
          : "Bracket reopened for setup. Match results should still be handled in Match Center once it goes live again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The bracket status could not be changed.");
    } finally {
      setChangingStatus(false);
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
      playerA: playerA ?? undefined,
      playerB: playerB ?? undefined,
      playerC: playerC ?? undefined,
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
      {eventId ? (
        <section className={`competitive-status competitive-status-${bracketStatus.toLowerCase()}`}>
          <div><span className="eyebrow">Event bracket status</span><strong>{bracketStatus.replaceAll("_", " ")}</strong></div>
          <p>{bracketStatus === "DRAFT" ? "Generate and save the bracket before publishing it."
            : bracketStatus === "GENERATED" ? "Saved for staff. Publish it when participants are ready to follow along."
              : bracketStatus === "LIVE" ? "The bracket is live. Match Center now owns tournament results and corrections."
                : "Final results are locked and the completed bracket remains available to view."}</p>
        </section>
      ) : null}

      <section className="panel section-stack">
        <div className="section-header">
          <div>
            <h2>Bracket setup</h2>
            <p>Enter participant names, choose host placement or random placement, and generate the bracket before it goes live.</p>
          </div>
          {bracketLocked ? <span className="badge">{bracketStatus === "LIVE" ? "Live · Match Center" : "Locked"}</span> : null}
        </div>

        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="bracket-title">Bracket title</label>
            <input id="bracket-title" value={title} disabled={bracketLocked} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
          </div>
          <div className="form-stack compact">
            <label htmlFor="bracket-format">Format</label>
            <select
              id="bracket-format"
              value={format}
              disabled={bracketLocked}
              onChange={(event) => {
                const next = event.target.value as "single" | "three";
                setFormat(next);
                if (next === "three") setParticipantCount(3);
                clearResults();
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
              disabled={bracketLocked || format === "three"}
              onChange={(event) => setParticipantCount(Number(event.target.value))}
            />
          </div>
          <div className="form-stack compact">
            <label htmlFor="placement-mode">Placement</label>
            <select id="placement-mode" value={seedingMode} disabled={bracketLocked} onChange={(event) => setSeedingMode(event.target.value as "manual" | "random")}>
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
                disabled={bracketLocked}
                onChange={(event) => updateName(participant.id, event.target.value)}
                maxLength={80}
              />
              {seedingMode === "manual" ? (
                <div className="order-buttons">
                  <button className="button button-secondary" type="button" disabled={bracketLocked || index === 0} onClick={() => moveParticipant(index, -1)} aria-label={`Move ${participant.name} up`}>↑</button>
                  <button className="button button-secondary" type="button" disabled={bracketLocked || index === participants.length - 1} onClick={() => moveParticipant(index, 1)} aria-label={`Move ${participant.name} down`}>↓</button>
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
          <button className="button" type="button" onClick={generate} disabled={bracketLocked}>Generate bracket</button>
          <button className="button button-secondary" type="button" onClick={saveDraft} disabled={saving || bracketLocked}>{saving ? "Saving…" : eventId ? "Save bracket" : "Save draft"}</button>
          <button className="button button-secondary" type="button" onClick={downloadPng}>Download PNG</button>
          {eventId && bracketStatus === "GENERATED" ? <button className="button" type="button" disabled={changingStatus} onClick={() => changeBracketStatus("LIVE")}>Publish live</button> : null}
          {eventId && bracketStatus === "LIVE" ? <button className="button" type="button" disabled={changingStatus || !hasFinalResult} onClick={() => changeBracketStatus("COMPLETED")}>Mark completed</button> : null}
          {eventId && bracketStatus === "COMPLETED" ? <button className="button button-secondary" type="button" disabled={changingStatus} onClick={() => changeBracketStatus("GENERATED")}>Reopen bracket</button> : null}
        </div>
        {bracketStatus === "LIVE" && eventId ? <p className="muted">Need to enter a winner, correct a score, handle a no-show, or reopen a match? Use Match Center so the action is confirmed and audited.</p> : null}
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      </section>

      {format === "single" && rounds.length ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Single-elimination bracket</h2>
              <p>{bracketStatus === "LIVE" ? "Live results are read-only here. Use Match Center to operate each match." : "Select each match winner while preparing the bracket. First-round byes advance automatically; unfinished later-round slots remain TBD."}</p>
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
                          const slotName = slot === 0 ? "a" : "b";
                          const isWinner = participant && match.winner?.id === participant.id;
                          const isSelectable = Boolean(match.a && match.b && match.aReady && match.bReady);
                          return (
                            <button
                              className={`match-participant${isWinner ? " winner" : ""}${!participant ? " bye" : ""}`}
                              key={`${match.id}-${slot}`}
                              type="button"
                              disabled={bracketLocked || !participant || !isSelectable}
                              onClick={() => participant && chooseWinner(match, participant)}
                            >
                              <span>{participant?.name ?? getMatchSlotLabel(match, slotName)}</span>
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

      {format === "three" && participants.length === 3 ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Three-player bracket</h2>
              <p>{bracketStatus === "LIVE" ? "Live results are read-only here. Use Match Center to run all three matches." : "Select the winner of each available match while preparing or testing the bracket."}</p>
            </div>
            {threeChampion ? <span className="badge">Advances: {threeChampion.name}</span> : null}
          </div>

          <div className="three-match-grid">
            <ThreeMatch
              label="Match 1"
              a={playerA}
              b={playerB}
              winner={m1Winner}
              disabled={bracketLocked}
              onChoose={(participant) => setThreeWinners({ m1: participant.id })}
            />
            <ThreeMatch
              label="Match 2"
              a={playerC}
              b={m1Loser}
              winner={m2Winner}
              disabled={bracketLocked}
              onChoose={(participant) => setThreeWinners((current) => ({ m1: current.m1, m2: participant.id }))}
            />
            <ThreeMatch
              label="Match 3"
              a={playerC}
              b={m1Winner}
              winner={m3Winner}
              disabled={bracketLocked}
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
