import type { LevelProgress } from "@/types/pulse";

export const LEVEL_THRESHOLDS = [0, 500, 1000, 2000, 3500, 5500, 8000];

export function getLevelProgress(totalPoints: number): LevelProgress {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (totalPoints >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? currentThreshold + 2500;
  const span = Math.max(1, nextThreshold - currentThreshold);
  const into = Math.max(0, totalPoints - currentThreshold);

  return {
    level,
    currentThreshold,
    nextThreshold,
    pointsToNext: Math.max(0, nextThreshold - totalPoints),
    ratio: Math.min(1, into / span),
  };
}

export function sumPoints(points: number[]) {
  return points.reduce((total, value) => total + value, 0);
}
