import { createHash } from "node:crypto";
import { SCORABLE_FACTS, type ChallengeTemplate } from "./types";

const FACTS = new Set<string>(SCORABLE_FACTS);

export function challengeHash(seed: string) {
  const hex = createHash("md5").update(seed).digest("hex").slice(0, 8);
  const value = Number.parseInt(hex, 16);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

export function compatibleTemplates(templates: ChallengeTemplate[]) {
  return templates.filter(
    (template) =>
      template.active &&
      template.scoringRule &&
      template.scoringRule.op &&
      template.options.length >= 2 &&
      template.requiredFacts.every((fact) => FACTS.has(fact)),
  );
}

export function blockedTemplateCodes(
  templates: ChallengeTemplate[],
  gameStartsAt: string,
  recent: { code: string; startsAt: string }[],
) {
  const gameTime = Date.parse(gameStartsAt);
  const blocked = new Set<string>();
  for (const use of recent) {
    const template = templates.find((item) => item.code === use.code);
    const days = template?.cooldownDays ?? 1;
    const used = Date.parse(use.startsAt);
    if (Number.isFinite(gameTime) && Number.isFinite(used) && used < gameTime && gameTime - used <= days * 86_400_000) {
      blocked.add(use.code);
    }
  }
  return [...blocked];
}

const PLANS = [
  [2, 4, 4, 6, 8],
  [2, 4, 6, 8, 10],
  [2, 4, 6, 6, 10],
  [2, 4, 4, 8, 10],
];

function difficultyPlan(gameId: string) {
  return PLANS[Math.abs(challengeHash(`${gameId}:plan`)) % PLANS.length];
}

function orderVaried(picked: ChallengeTemplate[], gameId: string) {
  const sorted = [...picked].sort((a, b) => a.points - b.points || a.code.localeCompare(b.code));
  if (sorted.length < 2) return sorted;
  const rotate = Math.abs(challengeHash(`${gameId}:order`));
  if (rotate % 2 === 1) {
    const index = rotate % (sorted.length - 1);
    const copy = [...sorted];
    const current = copy[index];
    copy[index] = copy[index + 1];
    copy[index + 1] = current;
    return copy;
  }
  return sorted;
}

export function selectChallenges(input: {
  templates: ChallengeTemplate[];
  gameId: string;
  previousCodes?: string[];
  limit?: number;
}) {
  const limit = input.limit ?? 5;
  const compatible = compatibleTemplates(input.templates);
  const blocked = new Set(input.previousCodes ?? []);
  const fresh = compatible.filter((template) => !blocked.has(template.code));
  const pool = fresh.length >= Math.min(limit, compatible.length) && fresh.length > 0 ? fresh : compatible;
  const ranked = [...pool].sort((a, b) => {
    const delta = challengeHash(`${input.gameId}:${a.code}`) - challengeHash(`${input.gameId}:${b.code}`);
    if (delta !== 0) return delta;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.code.localeCompare(b.code);
  });
  const picked: ChallengeTemplate[] = [];
  const categories = new Set<string>();
  for (const points of difficultyPlan(input.gameId)) {
    if (picked.length >= limit) break;
    const hit = ranked.find((template) => !picked.includes(template) && !categories.has(template.category) && template.points === points);
    if (!hit) continue;
    picked.push(hit);
    categories.add(hit.category);
  }
  for (const template of ranked) {
    if (picked.length >= limit) break;
    if (picked.includes(template) || categories.has(template.category)) continue;
    picked.push(template);
    categories.add(template.category);
  }
  for (const template of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(template)) picked.push(template);
  }
  return orderVaried(picked, input.gameId).slice(0, Math.min(limit, picked.length));
}
