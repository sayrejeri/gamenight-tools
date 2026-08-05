export type Participant = { id: string; name: string };
export type Pair = [Participant | null, Participant | null];
export type WinnerMap = Record<string, string>;
export type ThreeWinnerMap = { m1?: string; m2?: string; m3?: string };

export type BracketDraft = {
  version: 1;
  title: string;
  format: "single" | "three";
  seedingMode: "manual" | "random";
  participants: Participant[];
  firstRound: Pair[];
  winners: WinnerMap;
  threeWinners: ThreeWinnerMap;
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

export function makeParticipant(index: number, name = ""): Participant {
  return { id: crypto.randomUUID(), name: name || `Player ${index + 1}` };
}

function nextPowerOfTwo(value: number): number {
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

export function isDraft(value: unknown): value is BracketDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<BracketDraft>;
  return draft.version === 1 && Array.isArray(draft.participants) && Array.isArray(draft.firstRound);
}
