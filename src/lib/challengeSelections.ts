import type { GameChallenge } from "@/services/matchesApi";

export const MAX_MATCH_CHALLENGES = 3;

export function hydrateChallengeSelections(rows: GameChallenge[]) {
  return Object.fromEntries(
    rows.filter((row) => row.myOption).map((row) => [row.id, row.myOption as string]),
  );
}

export function selectedChallengeRows(rows: GameChallenge[], selections: Record<string, string>) {
  return rows.filter((row) => Boolean(selections[row.id]));
}

export function updateChallengeSelection(
  selections: Record<string, string>,
  challengeId: string,
  optionId: string,
) {
  const next = { ...selections };
  if (next[challengeId] === optionId) {
    delete next[challengeId];
    return { selections: next, notice: "" };
  }
  if (!next[challengeId] && Object.keys(next).length >= MAX_MATCH_CHALLENGES) {
    return { selections, notice: "Ya elegiste 3 retos. Cambia uno para seleccionar otro." };
  }
  next[challengeId] = optionId;
  return { selections: next, notice: "" };
}
