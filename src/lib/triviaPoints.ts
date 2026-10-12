export function triviaPointsForDifficulty(levelOrDifficulty: string): number {
  switch (levelOrDifficulty.trim().toLowerCase()) {
    case "easy":
    case "beginner":
    case "iniciado":
      return 2;
    case "medium":
    case "intermediate":
    case "intermedio":
      return 4;
    case "hard":
    case "advanced":
    case "avanzado":
      return 6;
    default:
      return 0;
  }
}

export function awardedTriviaPoints(levelOrDifficulty: string, correct: boolean): number {
  if (!correct) return 0;
  return triviaPointsForDifficulty(levelOrDifficulty);
}
