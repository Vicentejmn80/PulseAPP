import { matchPhase, type BaseballMatch } from "@/services/matchesApi";

export type PredictionState = "available" | "closed" | "suspended";

export function isSuspendedMatch(match: BaseballMatch) {
  return match.status === "postponed" || match.status === "cancelled";
}

export function predictionState(match: BaseballMatch): PredictionState {
  if (isSuspendedMatch(match)) return "suspended";
  const phase = matchPhase(match);
  if (phase === "open") return "available";
  return "closed";
}

export function isUpcomingPrediction(match: BaseballMatch) {
  const phase = matchPhase(match);
  if (phase === "finished" || phase === "cancelled") return false;
  if (isSuspendedMatch(match)) return false;
  return true;
}

export function isFinalizedPrediction(match: BaseballMatch) {
  const phase = matchPhase(match);
  return phase === "finished" || phase === "cancelled" || isSuspendedMatch(match);
}

export function predictionBadge(match: BaseballMatch) {
  const state = predictionState(match);
  if (state === "suspended") {
    const label = match.status === "postponed" ? "⏸️ Suspendido" : "⛔ Suspendido";
    return { state, label, tone: "muted" as const };
  }
  if (state === "available") return { state, label: "🟢 Disponible", tone: "open" as const };
  return { state, label: "🔒 Cerrado", tone: "locked" as const };
}

