import {
  deriveSingleElimination,
  resolveThreePlayerAdvancement,
  type BracketDraft,
  type Participant,
} from "@/components/bracket/bracket-model";

function cloneDraft(draft: BracketDraft): BracketDraft {
  return {
    ...draft,
    participants: [...draft.participants],
    firstRound: draft.firstRound.map(([a, b]) => [a, b]),
    winners: { ...draft.winners },
    threeWinners: { ...draft.threeWinners },
  };
}

function sanitizeSingleWinners(draft: BracketDraft): void {
  for (let pass = 0; pass < 16; pass += 1) {
    let changed = false;
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    const validMatches = new Map(rounds.flat().map((match) => [match.id, match]));

    for (const [matchId, winnerId] of Object.entries(draft.winners)) {
      const match = validMatches.get(matchId);
      const valid = Boolean(
        match?.a
        && match?.b
        && (winnerId === match.a.id || winnerId === match.b.id),
      );
      if (!valid) {
        delete draft.winners[matchId];
        changed = true;
      }
    }

    if (!changed) break;
  }
}

export function getDraftMatchParticipants(draft: BracketDraft, sourceMatchId: string): Participant[] {
  if (draft.format === "single") {
    const match = deriveSingleElimination(draft.firstRound, draft.winners)
      .flat()
      .find((item) => item.id === sourceMatchId);
    return [match?.a ?? null, match?.b ?? null].filter((item): item is Participant => Boolean(item));
  }

  const resolution = resolveThreePlayerAdvancement(draft.participants, draft.threeWinners);
  if (sourceMatchId === "m1") {
    return [resolution.playerA, resolution.playerB].filter((item): item is Participant => Boolean(item));
  }
  if (sourceMatchId === "m2") {
    return [resolution.playerC, resolution.m1Loser].filter((item): item is Participant => Boolean(item));
  }
  if (sourceMatchId === "m3") {
    return [resolution.playerC, resolution.m1Winner].filter((item): item is Participant => Boolean(item));
  }
  return [];
}

export function applyDraftWinner(draft: BracketDraft, sourceMatchId: string, participantKey: string): BracketDraft {
  const next = cloneDraft(draft);
  const participants = getDraftMatchParticipants(next, sourceMatchId);
  if (!participants.some((participant) => participant.id === participantKey)) {
    throw new Error("The selected winner is not in this match.");
  }

  if (next.format === "single") {
    next.winners[sourceMatchId] = participantKey;
    sanitizeSingleWinners(next);
    return next;
  }

  if (sourceMatchId === "m1") {
    next.threeWinners.m1 = participantKey;
    delete next.threeWinners.m2;
    delete next.threeWinners.m3;
  } else if (sourceMatchId === "m2") {
    next.threeWinners.m2 = participantKey;
  } else if (sourceMatchId === "m3") {
    next.threeWinners.m3 = participantKey;
  } else {
    throw new Error("Unknown three-player match.");
  }
  return next;
}

export function clearDraftWinner(draft: BracketDraft, sourceMatchId: string): BracketDraft {
  const next = cloneDraft(draft);

  if (next.format === "single") {
    delete next.winners[sourceMatchId];
    sanitizeSingleWinners(next);
    return next;
  }

  if (sourceMatchId === "m1") {
    delete next.threeWinners.m1;
    delete next.threeWinners.m2;
    delete next.threeWinners.m3;
  } else if (sourceMatchId === "m2") {
    delete next.threeWinners.m2;
  } else if (sourceMatchId === "m3") {
    delete next.threeWinners.m3;
  }
  return next;
}
