export type UpdatedGameNameInput = {
  submittedSubgameName?: string | null;
  submittedPlatformName?: string | null;
  gameFieldsTouched?: boolean;
  existingGameName?: string | null;
  existingPlatformName?: string | null;
  existingSubgameName?: string | null;
};

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveUpdatedGameName(input: UpdatedGameNameInput): string | null {
  const submittedSubgame = clean(input.submittedSubgameName);
  const submittedPlatform = clean(input.submittedPlatformName);
  if (submittedSubgame) return submittedSubgame;
  if (submittedPlatform) return submittedPlatform;

  const isLegacyOnly = !clean(input.existingSubgameName) && !clean(input.existingPlatformName);
  if (!input.gameFieldsTouched && isLegacyOnly) return clean(input.existingGameName);

  return null;
}
