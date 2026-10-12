import { createHash } from "node:crypto";

export interface RotationQuestion {
  id: string;
  lastSeen: string | null;
}

function dailyOrderKey(questionId: string, userId: string, dateKey: string): string {
  return createHash("md5").update(`${questionId}:${userId}:${dateKey}`).digest("hex");
}

export function selectIniciadoQuestions(
  questions: RotationQuestion[],
  userId: string,
  dateKey: string,
  count = 4,
): string[] {
  const ranked = [...questions].sort((left, right) => {
    if (left.lastSeen === null && right.lastSeen !== null) return -1;
    if (left.lastSeen !== null && right.lastSeen === null) return 1;
    if (left.lastSeen !== null && right.lastSeen !== null && left.lastSeen !== right.lastSeen) {
      return left.lastSeen < right.lastSeen ? -1 : 1;
    }
    return dailyOrderKey(left.id, userId, dateKey).localeCompare(dailyOrderKey(right.id, userId, dateKey));
  });
  const ids: string[] = [];
  for (const item of ranked) {
    if (ids.includes(item.id)) continue;
    ids.push(item.id);
    if (ids.length === count) break;
  }
  return ids;
}
