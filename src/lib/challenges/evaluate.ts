import type { FinalScore, ScoringRule } from "./types";

export function factValue(fact: ScoringRule["fact"], score: FinalScore) {
  const home = score.home;
  const away = score.away;
  const total = home + away;
  const margin = Math.abs(home - away);
  const winner = Math.max(home, away);
  const loser = Math.min(home, away);
  if (fact === "total") return total;
  if (fact === "margin") return margin;
  if (fact === "winner_runs") return winner;
  if (fact === "loser_runs") return loser;
  if (fact === "home") return home;
  if (fact === "away") return away;
  return total;
}

export function ruleHolds(rule: ScoringRule, score: FinalScore): boolean {
  const home = score.home;
  const away = score.away;
  const total = home + away;
  const margin = Math.abs(home - away);
  const winner = Math.max(home, away);
  const loser = Math.min(home, away);
  const n = rule.n ?? 0;
  switch (rule.op) {
    case "total_gte":
      return total >= n;
    case "total_lte":
      return total <= n;
    case "total_eq":
      return total === n;
    case "margin_eq":
      return margin === n;
    case "margin_gte":
      return margin >= n;
    case "margin_lte":
      return margin <= n;
    case "both_gte":
      return home >= n && away >= n;
    case "both_lte":
      return home <= n && away <= n;
    case "either_gte":
      return home >= n || away >= n;
    case "loser_lte":
      return loser <= n;
    case "loser_gte":
      return loser >= n;
    case "winner_gte":
      return winner >= n;
    case "winner_lte":
      return winner <= n;
    case "home_gte":
      return home >= n;
    case "home_lte":
      return home <= n;
    case "home_eq":
      return home === n;
    case "away_gte":
      return away >= n;
    case "away_lte":
      return away <= n;
    case "away_eq":
      return away === n;
    case "shutout":
      return loser === 0;
    case "parity":
      return rule.even ? total % 2 === 0 : total % 2 === 1;
    case "winner_doubles":
      return loser >= 1 && winner >= loser * 2;
    case "and":
      return (rule.rules ?? []).every((item) => ruleHolds(item, score));
    case "buckets":
      return false;
    default:
      return false;
  }
}

export function correctOptionId(rule: ScoringRule, score: FinalScore) {
  if (rule.op === "buckets") {
    const value = factValue(rule.fact, score);
    const bucket = (rule.buckets ?? []).find((item) => value >= item.min && (item.max == null || value <= item.max));
    return bucket?.id ?? "";
  }
  return ruleHolds(rule, score) ? "si" : "no";
}

export function challengeAward(rule: ScoringRule, points: number, optionId: string, score: FinalScore) {
  const correct = optionId === correctOptionId(rule, score);
  return { correct, points: correct ? points : 0 };
}

export function publicChallengeAnswers(rows: Record<string, unknown>[]) {
  return rows.slice(0, 3).map((row) => ({
    challengeId: String(row.challengeId ?? ""),
    optionId: String(row.optionId ?? ""),
  }));
}

export function toggleChallengePick(selected: string[], id: string) {
  if (selected.includes(id)) {
    return { selected: selected.filter((item) => item !== id), notice: "" };
  }
  if (selected.length >= 3) {
    return { selected, notice: "Ya elegiste 3 retos. Cambia uno para seleccionar otro." };
  }
  return { selected: [...selected, id], notice: "" };
}
