import {
  deriveExpandedCompetitionMatches,
  deriveSingleElimination,
  resolveThreePlayerAdvancement,
  type BracketDraft,
  type Participant,
} from "@/components/bracket/bracket-model";

function cloneDraft(draft: BracketDraft): BracketDraft {
  return {
    ...draft,
    participants: draft.participants.map((participant) => ({
      ...participant,
      roster: participant.roster ? participant.roster.map((member) => ({ ...member })) : undefined,
    })),
    firstRound: draft.firstRound.map(([a, b]) => [a ? { ...a } : null, b ? { ...b } : null]),
    winners: { ...draft.winners },
    threeWinners: { ...draft.threeWinners },
    competitionMatches: draft.competitionMatches?.map((match) => ({
      ...match,
      a: { ...match.a },
      b: { ...match.b },
      conditional: match.conditional ? { ...match.conditional } : undefined,
    })),
    groups: draft.groups ? Object.fromEntries(Object.entries(draft.groups).map(([group, ids]) => [group, [...ids]])) : undefined,
  };
}

function sanitizeSingleWinners(draft: BracketDraft): void {
  for (let pass = 0; pass < 32; pass += 1) {
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

function sanitizeExpandedWinners(draft: BracketDraft): void {
  const knownMatchIds = new Set((draft.competitionMatches ?? []).map((match) => match.id));
  for (const matchId of Object.keys(draft.winners)) {
    if (!knownMatchIds.has(matchId)) delete draft.winners[matchId];
  }

  for (let pass = 0; pass < 64; pass += 1) {
    let changed = false;
    const resolved = new Map(deriveExpandedCompetitionMatches(draft).map((match) => [match.id, match]));
    for (const [matchId, winnerId] of Object.entries(draft.winners)) {
      const match = resolved.get(matchId);
      const valid = Boolean(
        match?.active
        && match.a
        && match.b
        && match.aReady
        && match.bReady
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

export function sanitizeDraftWinners(draft: BracketDraft): void {
  if (draft.format === "single") sanitizeSingleWinners(draft);
  else if (draft.format !== "three") sanitizeExpandedWinners(draft);
}

export function getDraftMatchParticipants(draft: BracketDraft, sourceMatchId: string): Participant[] {
  if (draft.format === "single") {
    const match = deriveSingleElimination(draft.firstRound, draft.winners)
      .flat()
      .find((item) => item.id === sourceMatchId);
    return [match?.a ?? null, match?.b ?? null].filter((item): item is Participant => Boolean(item));
  }

  if (draft.format === "three") {
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

  const match = deriveExpandedCompetitionMatches(draft).find((item) => item.id === sourceMatchId && item.active);
  return [match?.a ?? null, match?.b ?? null].filter((item): item is Participant => Boolean(item));
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

  if (next.format === "three") {
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

  next.winners[sourceMatchId] = participantKey;
  sanitizeExpandedWinners(next);
  return next;
}

export function clearDraftWinner(draft: BracketDraft, sourceMatchId: string): BracketDraft {
  const next = cloneDraft(draft);

  if (next.format === "single") {
    delete next.winners[sourceMatchId];
    sanitizeSingleWinners(next);
    return next;
  }

  if (next.format === "three") {
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

  delete next.winners[sourceMatchId];
  sanitizeExpandedWinners(next);
  return next;
}
