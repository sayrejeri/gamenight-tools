export type ParticipantRosterMember = {
  userId: string;
  name: string;
  role?: string;
};

export type Participant = {
  id: string;
  name: string;
  entrantType?: "player" | "team";
  teamId?: string;
  roster?: ParticipantRosterMember[];
};
export type Pair = [Participant | null, Participant | null];
export type WinnerMap = Record<string, string>;
export type ThreeWinnerMap = { m1?: string; m2?: string; m3?: string };
export type BracketFormat = "single" | "three" | "double" | "round_robin" | "groups";
export type BracketEntrantMode = "player" | "team";
export type TieBreakMode = "HEAD_TO_HEAD_THEN_SEED" | "SEED";

export type MatchSlotRef =
  | { type: "participant"; participantId: string }
  | { type: "winner"; matchId: string }
  | { type: "loser"; matchId: string }
  | { type: "group_rank"; group: string; rank: number }
  | { type: "none" };

export type CompetitionStage = "round_robin" | "group" | "winners" | "losers" | "playoff" | "grand_final";

export type CompetitionMatchSpec = {
  id: string;
  stage: CompetitionStage;
  round: number;
  index: number;
  label: string;
  group?: string;
  a: MatchSlotRef;
  b: MatchSlotRef;
  conditional?: {
    type: "double_reset";
    grandFinalId: string;
    winnersChampionMatchId: string;
  };
};

export type BracketDraft = {
  version: 1 | 2;
  title: string;
  format: BracketFormat;
  seedingMode: "manual" | "random";
  participants: Participant[];
  firstRound: Pair[];
  winners: WinnerMap;
  threeWinners: ThreeWinnerMap;
  competitionMatches?: CompetitionMatchSpec[];
  groups?: Record<string, string[]>;
  groupAdvancers?: number;
  tieBreakMode?: TieBreakMode;
  entrantMode?: BracketEntrantMode;
};

export type DerivedMatch = {
  id: string;
  round: number;
  index: number;
  a: Participant | null;
  b: Participant | null;
  aReady: boolean;
  bReady: boolean;
  winner: Participant | null;
};

export type ResolvedCompetitionMatch = DerivedMatch & {
  stage: CompetitionStage;
  label: string;
  group?: string;
  active: boolean;
  loser: Participant | null;
};

export type StandingRow = {
  participant: Participant;
  wins: number;
  losses: number;
  played: number;
  seed: number;
};

export type ThreePlayerResolution = {
  playerA: Participant | null;
  playerB: Participant | null;
  playerC: Participant | null;
  m1Winner: Participant | null;
  m1Loser: Participant | null;
  m2Winner: Participant | null;
  m3Winner: Participant | null;
  champion: Participant | null;
  reason: string;
};

export function makeParticipant(index: number, name = ""): Participant {
  return { id: crypto.randomUUID(), name: name || `Player ${index + 1}` };
}

export function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function spreadMatchPositions(pairCount: number, matchCount: number): Set<number> {
  const positions = new Set<number>();
  if (matchCount <= 0) return positions;
  for (let index = 0; index < matchCount; index += 1) {
    positions.add(Math.floor(((index + 0.5) * pairCount) / matchCount));
  }
  return positions;
}

export function buildFirstRound(participants: Participant[]): Pair[] {
  const size = nextPowerOfTwo(participants.length);
  const pairCount = size / 2;
  const byeCount = size - participants.length;
  const playedMatchCount = pairCount - byeCount;
  const playedMatchPositions = spreadMatchPositions(pairCount, playedMatchCount);
  const pairs: Pair[] = [];
  let cursor = 0;

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const a = participants[cursor] ?? null;
    cursor += 1;
    if (playedMatchPositions.has(pairIndex)) {
      const b = participants[cursor] ?? null;
      cursor += 1;
      pairs.push([a, b]);
    } else {
      pairs.push([a, null]);
    }
  }
  return pairs;
}

export function getMatchSlotLabel(match: DerivedMatch, slot: "a" | "b"): string {
  const participant = slot === "a" ? match.a : match.b;
  if (participant) return participant.name;
  const ready = slot === "a" ? match.aReady : match.bReady;
  return ready ? "BYE" : "TBD";
}

export function deriveSingleElimination(firstRound: Pair[], selectedWinners: WinnerMap): DerivedMatch[][] {
  if (!firstRound.length) return [];
  const bracketSize = firstRound.length * 2;
  const roundCount = Math.log2(bracketSize);
  const rounds: DerivedMatch[][] = [];

  for (let round = 0; round < roundCount; round += 1) {
    const matchCount = bracketSize / 2 ** (round + 1);
    const matches: DerivedMatch[] = [];
    for (let index = 0; index < matchCount; index += 1) {
      const id = `r${round}m${index}`;
      const sourceA = round > 0 ? rounds[round - 1][index * 2] : null;
      const sourceB = round > 0 ? rounds[round - 1][index * 2 + 1] : null;
      const a = round === 0 ? firstRound[index]?.[0] ?? null : sourceA?.winner ?? null;
      const b = round === 0 ? firstRound[index]?.[1] ?? null : sourceB?.winner ?? null;
      const aReady = round === 0 || Boolean(sourceA?.winner);
      const bReady = round === 0 || Boolean(sourceB?.winner);
      const selected = selectedWinners[id];
      let winner: Participant | null = null;
      if (aReady && bReady) {
        if (a && !b) winner = a;
        if (!a && b) winner = b;
        if (a && b && selected === a.id) winner = a;
        if (a && b && selected === b.id) winner = b;
      }
      matches.push({ id, round, index, a, b, aReady, bReady, winner });
    }
    rounds.push(matches);
  }
  return rounds;
}

export function resolveThreePlayerAdvancement(participants: Participant[], winners: ThreeWinnerMap): ThreePlayerResolution {
  const [playerA = null, playerB = null, playerC = null] = participants.slice(0, 3);
  const m1Winner = [playerA, playerB].find((player) => player?.id === winners.m1) ?? null;
  const m1Loser = m1Winner ? (m1Winner.id === playerA?.id ? playerB : playerA) : null;
  const m2Winner = [playerC, m1Loser].find((player) => player?.id === winners.m2) ?? null;
  const m3Winner = [playerC, m1Winner].find((player) => player?.id === winners.m3) ?? null;
  let champion: Participant | null = null;
  let reason = "Complete all three matches to calculate who advances.";

  if (m1Winner && m1Loser && m2Winner && m3Winner && playerC) {
    if (m2Winner.id === playerC.id) {
      champion = m3Winner;
      reason = `${m1Loser.name} lost both opening matches. The winner of ${m1Winner.name} vs ${playerC.name} advances.`;
    } else if (m3Winner.id === playerC.id) {
      champion = playerC;
      reason = `${playerC.name} defeated the first-match winner, so ${playerC.name} advances under the three-player rule.`;
    } else {
      champion = m1Loser;
      reason = `${m1Winner.name} won the final listed match, so ${m1Loser.name} advances because they defeated ${playerC.name} and no rematch is played.`;
    }
  }
  return { playerA, playerB, playerC, m1Winner, m1Loser, m2Winner, m3Winner, champion, reason };
}

function participantRef(participant: Participant | null): MatchSlotRef {
  return participant ? { type: "participant", participantId: participant.id } : { type: "none" };
}
function winnerRef(matchId: string): MatchSlotRef { return { type: "winner", matchId }; }
function loserRef(matchId: string): MatchSlotRef { return { type: "loser", matchId }; }
function groupRankRef(group: string, rank: number): MatchSlotRef { return { type: "group_rank", group, rank }; }

function robustRoundRobinPairs(participantIds: string[]): Array<Array<[string, string]>> {
  const slots: Array<string | null> = [...participantIds];
  if (slots.length % 2 === 1) slots.push(null);
  if (slots.length < 2) return [];
  const rounds: Array<Array<[string, string]>> = [];
  let ring = [...slots];
  for (let round = 0; round < slots.length - 1; round += 1) {
    const pairs: Array<[string, string]> = [];
    for (let index = 0; index < ring.length / 2; index += 1) {
      const a = ring[index];
      const b = ring[ring.length - 1 - index];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const fixed = ring[0];
    const tail = ring.slice(1);
    tail.unshift(tail.pop() ?? null);
    ring = [fixed, ...tail];
  }
  return rounds;
}

export function buildRoundRobinCompetition(participants: Participant[], prefix = "rr", group?: string): CompetitionMatchSpec[] {
  const rounds = robustRoundRobinPairs(participants.map((participant) => participant.id));
  return rounds.flatMap((pairs, roundIndex) => pairs.map(([aId, bId], index) => ({
    id: `${prefix}-r${roundIndex + 1}-m${index + 1}`,
    stage: group ? "group" as const : "round_robin" as const,
    round: roundIndex + 1,
    index,
    label: group ? `Group ${group} · Round ${roundIndex + 1}` : `Round ${roundIndex + 1}`,
    group,
    a: { type: "participant" as const, participantId: aId },
    b: { type: "participant" as const, participantId: bId },
  })));
}

export function assignCompetitionGroups(participants: Participant[], requestedGroupCount: number): Record<string, string[]> {
  const groupCount = Math.max(2, Math.min(16, requestedGroupCount, Math.max(2, Math.floor(participants.length / 2))));
  const names = Array.from({ length: groupCount }, (_, index) => String.fromCharCode(65 + index));
  const groups = Object.fromEntries(names.map((name) => [name, [] as string[]]));
  for (let index = 0; index < participants.length; index += 1) {
    const row = Math.floor(index / groupCount);
    const position = index % groupCount;
    const groupIndex = row % 2 === 0 ? position : groupCount - 1 - position;
    groups[names[groupIndex]].push(participants[index].id);
  }
  return groups;
}

function buildEliminationFromRefs(
  firstRoundRefs: Array<[MatchSlotRef, MatchSlotRef]>,
  prefix: string,
  stage: "playoff" | "winners",
  labelPrefix: string,
): CompetitionMatchSpec[] {
  const specs: CompetitionMatchSpec[] = [];
  let currentIds: string[] = [];
  firstRoundRefs.forEach(([a, b], index) => {
    const id = `${prefix}-r1-m${index + 1}`;
    currentIds.push(id);
    specs.push({ id, stage, round: 1, index, label: `${labelPrefix} Round 1`, a, b });
  });
  let round = 2;
  while (currentIds.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < currentIds.length; index += 2) {
      const id = `${prefix}-r${round}-m${Math.floor(index / 2) + 1}`;
      next.push(id);
      specs.push({
        id,
        stage,
        round,
        index: Math.floor(index / 2),
        label: currentIds.length === 2 ? `${labelPrefix} Final` : `${labelPrefix} Round ${round}`,
        a: winnerRef(currentIds[index]),
        b: currentIds[index + 1] ? winnerRef(currentIds[index + 1]) : { type: "none" },
      });
    }
    currentIds = next;
    round += 1;
  }
  return specs;
}

export function buildDoubleEliminationCompetition(participants: Participant[]): CompetitionMatchSpec[] {
  const firstRound = buildFirstRound(participants);
  const winnersFirstRefs: Array<[MatchSlotRef, MatchSlotRef]> = firstRound.map(([a, b]) => [participantRef(a), participantRef(b)]);
  const winners = buildEliminationFromRefs(winnersFirstRefs, "wb", "winners", "Winners");
  const winnersByRound = new Map<number, CompetitionMatchSpec[]>();
  for (const match of winners) {
    const list = winnersByRound.get(match.round) ?? [];
    list.push(match);
    winnersByRound.set(match.round, list);
  }
  const winnersRoundCount = Math.max(...winners.map((match) => match.round), 1);
  const winnersFirst = winnersByRound.get(1) ?? [];
  const losers: CompetitionMatchSpec[] = [];

  if (winnersFirst.length > 1) {
    let previousLosersRound: string[] = [];
    const initialCount = Math.floor(winnersFirst.length / 2);
    for (let index = 0; index < initialCount; index += 1) {
      const id = `lb-r1-m${index + 1}`;
      losers.push({
        id,
        stage: "losers",
        round: 1,
        index,
        label: "Losers Round 1",
        a: loserRef(winnersFirst[index * 2].id),
        b: loserRef(winnersFirst[index * 2 + 1].id),
      });
      previousLosersRound.push(id);
    }

    let losersRoundNumber = 2;
    for (let winnersRound = 2; winnersRound <= winnersRoundCount; winnersRound += 1) {
      const injectedLosers = winnersByRound.get(winnersRound) ?? [];
      const injectionIds: string[] = [];
      for (let index = 0; index < injectedLosers.length; index += 1) {
        const id = `lb-r${losersRoundNumber}-m${index + 1}`;
        const sourceIndex = previousLosersRound.length ? Math.min(index, previousLosersRound.length - 1) : index;
        const wbIndex = injectedLosers.length - 1 - index;
        losers.push({
          id,
          stage: "losers",
          round: losersRoundNumber,
          index,
          label: `Losers Round ${losersRoundNumber}`,
          a: previousLosersRound[sourceIndex] ? winnerRef(previousLosersRound[sourceIndex]) : { type: "none" },
          b: loserRef(injectedLosers[wbIndex].id),
        });
        injectionIds.push(id);
      }
      previousLosersRound = injectionIds;
      losersRoundNumber += 1;

      if (winnersRound < winnersRoundCount && previousLosersRound.length > 1) {
        const consolidationIds: string[] = [];
        for (let index = 0; index < previousLosersRound.length; index += 2) {
          const id = `lb-r${losersRoundNumber}-m${Math.floor(index / 2) + 1}`;
          losers.push({
            id,
            stage: "losers",
            round: losersRoundNumber,
            index: Math.floor(index / 2),
            label: `Losers Round ${losersRoundNumber}`,
            a: winnerRef(previousLosersRound[index]),
            b: previousLosersRound[index + 1] ? winnerRef(previousLosersRound[index + 1]) : { type: "none" },
          });
          consolidationIds.push(id);
        }
        previousLosersRound = consolidationIds;
        losersRoundNumber += 1;
      }
    }
  }

  const winnersFinal = winners.find((match) => match.round === winnersRoundCount && match.index === 0) ?? winners.at(-1);
  if (!winnersFinal) return [];
  const losersFinal = losers.at(-1);
  const lowerChampionRef: MatchSlotRef = losersFinal ? winnerRef(losersFinal.id) : loserRef(winnersFinal.id);
  const grandFinal: CompetitionMatchSpec = {
    id: "gf-1",
    stage: "grand_final",
    round: 1,
    index: 0,
    label: "Grand Final",
    a: winnerRef(winnersFinal.id),
    b: lowerChampionRef,
  };
  const resetFinal: CompetitionMatchSpec = {
    id: "gf-2",
    stage: "grand_final",
    round: 2,
    index: 0,
    label: "Grand Final Reset",
    a: winnerRef(grandFinal.id),
    b: loserRef(grandFinal.id),
    conditional: { type: "double_reset", grandFinalId: grandFinal.id, winnersChampionMatchId: winnersFinal.id },
  };
  return [...winners, ...losers, grandFinal, resetFinal];
}

function qualifierRefs(groups: Record<string, string[]>, advancersPerGroup: number): MatchSlotRef[] {
  const groupNames = Object.keys(groups).sort();
  const refs: MatchSlotRef[] = [];
  for (let rank = 1; rank <= advancersPerGroup; rank += 1) {
    for (const group of groupNames) refs.push(groupRankRef(group, rank));
  }
  return refs;
}

function groupOfRef(ref: MatchSlotRef): string | null {
  return ref.type === "group_rank" ? ref.group : null;
}

function pairQualifierRefsForBracket(refs: MatchSlotRef[]): Array<[MatchSlotRef, MatchSlotRef]> {
  const size = nextPowerOfTwo(refs.length);
  const pairCount = size / 2;
  const byeCount = size - refs.length;
  const byes = refs.slice(0, byeCount);
  const remaining = refs.slice(byeCount);
  const playedPairs: Array<[MatchSlotRef, MatchSlotRef]> = [];

  while (remaining.length >= 2) {
    const a = remaining.shift() as MatchSlotRef;
    const aGroup = groupOfRef(a);
    let opponentIndex = -1;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const bGroup = groupOfRef(remaining[index]);
      if (!aGroup || !bGroup || aGroup !== bGroup) {
        opponentIndex = index;
        break;
      }
    }
    if (opponentIndex < 0) opponentIndex = remaining.length - 1;
    const [b] = remaining.splice(opponentIndex, 1);
    playedPairs.push([a, b]);
  }

  if (remaining.length === 1) byes.push(remaining.shift() as MatchSlotRef);
  const byePairs: Array<[MatchSlotRef, MatchSlotRef]> = byes.map((ref) => [ref, { type: "none" }]);
  const pairs = [...byePairs, ...playedPairs];
  while (pairs.length < pairCount) pairs.push([{ type: "none" }, { type: "none" }]);
  return pairs.slice(0, pairCount);
}

export function buildGroupsPlayoffCompetition(
  participants: Participant[],
  requestedGroupCount: number,
  requestedAdvancers: number,
): { groups: Record<string, string[]>; matches: CompetitionMatchSpec[]; advancers: number } {
  const groups = assignCompetitionGroups(participants, requestedGroupCount);
  const smallestGroup = Math.min(...Object.values(groups).map((members) => members.length));
  const advancers = Math.max(1, Math.min(requestedAdvancers, Math.max(1, smallestGroup)));
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const groupMatches = Object.entries(groups).flatMap(([group, ids]) => buildRoundRobinCompetition(
    ids.map((id) => byId.get(id)).filter((participant): participant is Participant => Boolean(participant)),
    `group-${group.toLowerCase()}`,
    group,
  ));
  const refs = qualifierRefs(groups, advancers);
  const playoffMatches = buildEliminationFromRefs(pairQualifierRefsForBracket(refs), "po", "playoff", "Playoff");
  return { groups, matches: [...groupMatches, ...playoffMatches], advancers };
}

function participantById(draft: BracketDraft): Map<string, Participant> {
  return new Map(draft.participants.map((participant) => [participant.id, participant]));
}

function roundRobinResultRows(draft: BracketDraft, group?: string): Array<{ aId: string; bId: string; winnerId: string }> {
  const rows: Array<{ aId: string; bId: string; winnerId: string }> = [];
  for (const spec of draft.competitionMatches ?? []) {
    if (group ? spec.stage !== "group" || spec.group !== group : spec.stage !== "round_robin") continue;
    if (spec.a.type !== "participant" || spec.b.type !== "participant") continue;
    const winnerId = draft.winners[spec.id];
    if (!winnerId) continue;
    rows.push({ aId: spec.a.participantId, bId: spec.b.participantId, winnerId });
  }
  return rows;
}

export function deriveCompetitionStandings(draft: BracketDraft, group?: string): { rows: StandingRow[]; complete: boolean } {
  const byId = participantById(draft);
  const ids = group ? draft.groups?.[group] ?? [] : draft.participants.map((participant) => participant.id);
  const allowed = new Set(ids);
  const rows = new Map<string, StandingRow>();
  ids.forEach((id) => {
    const participant = byId.get(id);
    if (participant) rows.set(id, { participant, wins: 0, losses: 0, played: 0, seed: draft.participants.findIndex((item) => item.id === id) + 1 });
  });

  const matches = (draft.competitionMatches ?? []).filter((match) => group ? match.stage === "group" && match.group === group : match.stage === "round_robin");
  let complete = matches.length > 0;
  const results = roundRobinResultRows(draft, group);
  const resultByPair = new Map<string, string>();
  for (const result of results) {
    if (!allowed.has(result.aId) || !allowed.has(result.bId)) continue;
    const loserId = result.winnerId === result.aId ? result.bId : result.aId;
    const winner = rows.get(result.winnerId);
    const loser = rows.get(loserId);
    if (winner) { winner.wins += 1; winner.played += 1; }
    if (loser) { loser.losses += 1; loser.played += 1; }
    resultByPair.set([result.aId, result.bId].sort().join(":"), result.winnerId);
  }
  if (results.length !== matches.length) complete = false;

  const tieBreakMode = draft.tieBreakMode ?? "HEAD_TO_HEAD_THEN_SEED";
  const winGroups = new Map<number, StandingRow[]>();
  for (const row of rows.values()) {
    const list = winGroups.get(row.wins) ?? [];
    list.push(row);
    winGroups.set(row.wins, list);
  }

  const ordered: StandingRow[] = [];
  for (const wins of [...winGroups.keys()].sort((a, b) => b - a)) {
    const tied = winGroups.get(wins) ?? [];
    if (tieBreakMode === "SEED" || tied.length <= 1) {
      tied.sort((a, b) => a.seed - b.seed);
      ordered.push(...tied);
      continue;
    }
    const tiedIds = new Set(tied.map((row) => row.participant.id));
    const headToHeadWins = new Map<string, number>(tied.map((row) => [row.participant.id, 0]));
    for (const result of results) {
      if (tiedIds.has(result.aId) && tiedIds.has(result.bId)) {
        headToHeadWins.set(result.winnerId, (headToHeadWins.get(result.winnerId) ?? 0) + 1);
      }
    }
    tied.sort((a, b) => (headToHeadWins.get(b.participant.id) ?? 0) - (headToHeadWins.get(a.participant.id) ?? 0) || a.seed - b.seed);
    ordered.push(...tied);
  }

  return { rows: ordered, complete };
}

function resolveGroupRank(draft: BracketDraft, group: string, rank: number): { participant: Participant | null; ready: boolean } {
  const standings = deriveCompetitionStandings(draft, group);
  return { participant: standings.complete ? standings.rows[rank - 1]?.participant ?? null : null, ready: standings.complete };
}

export function deriveExpandedCompetitionMatches(draft: BracketDraft): ResolvedCompetitionMatch[] {
  const specs = draft.competitionMatches ?? [];
  const bySpec = new Map(specs.map((spec) => [spec.id, spec]));
  const byParticipant = participantById(draft);
  const memo = new Map<string, ResolvedCompetitionMatch>();
  const resolving = new Set<string>();

  function resolveSlot(ref: MatchSlotRef): { participant: Participant | null; ready: boolean } {
    if (ref.type === "participant") return { participant: byParticipant.get(ref.participantId) ?? null, ready: true };
    if (ref.type === "none") return { participant: null, ready: true };
    if (ref.type === "group_rank") return resolveGroupRank(draft, ref.group, ref.rank);
    const source = resolveMatch(ref.matchId);
    if (!source) return { participant: null, ready: false };
    if (!source.active) return { participant: null, ready: true };
    if (!source.winner) {
      const sourceResolvedEmpty = source.aReady && source.bReady && !source.a && !source.b;
      return { participant: null, ready: sourceResolvedEmpty };
    }
    if (ref.type === "winner") return { participant: source.winner, ready: true };
    if (!source.a || !source.b) return { participant: null, ready: true };
    return { participant: source.winner.id === source.a.id ? source.b : source.a, ready: true };
  }

  function resolveMatch(matchId: string): ResolvedCompetitionMatch | null {
    const existing = memo.get(matchId);
    if (existing) return existing;
    const spec = bySpec.get(matchId);
    if (!spec || resolving.has(matchId)) return null;
    resolving.add(matchId);

    let active = true;
    if (spec.conditional?.type === "double_reset") {
      const firstFinal = resolveMatch(spec.conditional.grandFinalId);
      const winnersFinal = resolveMatch(spec.conditional.winnersChampionMatchId);
      active = Boolean(firstFinal?.winner && winnersFinal?.winner && firstFinal.winner.id !== winnersFinal.winner.id);
    }

    const aSlot = active ? resolveSlot(spec.a) : { participant: null, ready: false };
    const bSlot = active ? resolveSlot(spec.b) : { participant: null, ready: false };
    const selected = draft.winners[spec.id];
    let winner: Participant | null = null;
    if (active && aSlot.ready && bSlot.ready) {
      if (aSlot.participant && !bSlot.participant) winner = aSlot.participant;
      else if (!aSlot.participant && bSlot.participant) winner = bSlot.participant;
      else if (aSlot.participant && bSlot.participant) {
        if (selected === aSlot.participant.id) winner = aSlot.participant;
        if (selected === bSlot.participant.id) winner = bSlot.participant;
      }
    }
    const loser = winner && aSlot.participant && bSlot.participant
      ? winner.id === aSlot.participant.id ? bSlot.participant : aSlot.participant
      : null;
    const resolved: ResolvedCompetitionMatch = {
      id: spec.id,
      round: spec.round,
      index: spec.index,
      stage: spec.stage,
      label: spec.label,
      group: spec.group,
      a: aSlot.participant,
      b: bSlot.participant,
      aReady: aSlot.ready,
      bReady: bSlot.ready,
      winner,
      loser,
      active,
    };
    memo.set(matchId, resolved);
    resolving.delete(matchId);
    return resolved;
  }

  return specs.map((spec) => resolveMatch(spec.id)).filter((match): match is ResolvedCompetitionMatch => Boolean(match));
}

export function expandedFormatLabel(format: BracketFormat): string {
  if (format === "single") return "Single elimination";
  if (format === "three") return "Three-player advancement";
  if (format === "double") return "Double elimination";
  if (format === "round_robin") return "Round robin";
  return "Groups to playoffs";
}

export function bracketChampion(draft: BracketDraft): Participant | null {
  if (draft.format === "three") return resolveThreePlayerAdvancement(draft.participants, draft.threeWinners).champion;
  if (draft.format === "single") {
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    return rounds.at(-1)?.[0]?.winner ?? null;
  }
  if (draft.format === "round_robin") {
    const standings = deriveCompetitionStandings(draft);
    return standings.complete ? standings.rows[0]?.participant ?? null : null;
  }
  const resolved = deriveExpandedCompetitionMatches(draft);
  if (draft.format === "groups") {
    const playoffFinal = [...resolved].reverse().find((match) => match.stage === "playoff" && match.active);
    return playoffFinal?.winner ?? null;
  }
  const reset = resolved.find((match) => match.id === "gf-2");
  if (reset?.active) return reset.winner;
  const firstFinal = resolved.find((match) => match.id === "gf-1");
  const winnersFinal = [...resolved].reverse().find((match) => match.stage === "winners");
  if (firstFinal?.winner && winnersFinal?.winner && firstFinal.winner.id === winnersFinal.winner.id) return firstFinal.winner;
  return null;
}

export function isExpandedFormat(format: BracketFormat): format is "double" | "round_robin" | "groups" {
  return format === "double" || format === "round_robin" || format === "groups";
}

export function isDraft(value: unknown): value is BracketDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<BracketDraft>;
  const validFormat = draft.format === "single" || draft.format === "three" || draft.format === "double" || draft.format === "round_robin" || draft.format === "groups";
  if ((draft.version !== 1 && draft.version !== 2)
    || !validFormat
    || (draft.seedingMode !== "manual" && draft.seedingMode !== "random")
    || !Array.isArray(draft.participants)
    || !Array.isArray(draft.firstRound)
    || !Boolean(draft.winners && typeof draft.winners === "object")
    || !Boolean(draft.threeWinners && typeof draft.threeWinners === "object")) return false;
  if (draft.format === "double" || draft.format === "round_robin" || draft.format === "groups") {
    return Array.isArray(draft.competitionMatches);
  }
  return true;
}
