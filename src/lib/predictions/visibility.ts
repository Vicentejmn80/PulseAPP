import { matchPhase, type BaseballMatch } from "@/services/matchesApi";

/**
 * Estado de liquidación de un pronóstico en un partido finalizado.
 *
 * - "settled": el backend ya procesó el pronóstico (hay puntos definitivos).
 * - "pending": hay pronóstico pero todavía no está liquidado. La UI debe
 *   mostrar "pendiente de liquidación", NUNCA cero puntos como definitivos.
 * - "none": no hay nada que liquidar (sin pronóstico o partido no finalizado).
 */
export type SettlementState = "none" | "pending" | "settled";

export function settlementState(match: BaseballMatch): SettlementState {
  if (matchPhase(match) !== "finished") return "none";
  if (!match.prediction) return "none";
  return match.prediction.processed ? "settled" : "pending";
}

/**
 * Fusiona un partido recién leído del servidor con el estado local.
 *
 * Un refetch temporalmente desactualizado (sin `prediction`) nunca debe borrar
 * visualmente un pronóstico ya guardado: los pronósticos no se eliminan.
 */
export function mergeMatchWithSavedPrediction(
  current: BaseballMatch | null,
  fresh: BaseballMatch,
): BaseballMatch {
  if (!current) return fresh;
  if (current.prediction && !fresh.prediction) {
    return { ...fresh, prediction: current.prediction };
  }
  return fresh;
}

/**
 * Últimos partidos finalizados con pronóstico, ordenados del más reciente
 * al más antiguo. El historial no se limita al día de hoy.
 */
export function recentFinishedWithPrediction(
  matches: BaseballMatch[],
  limit = 3,
): BaseballMatch[] {
  return matches
    .filter((match) => matchPhase(match) === "finished" && match.prediction)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, Math.max(0, limit));
}

/**
 * Intervalo de polling para el detalle de un partido, en ms.
 *
 * - null: no hay que consultar (terminado y liquidado, cancelado o sin partido).
 * - 15000: terminado pero con liquidación pendiente (se sigue esperando el
 *   cierre del backend sin sobrecargar).
 * - 5000: partido abierto/en curso (comportamiento actual).
 */
export function settlementPollIntervalMs(match: BaseballMatch | null): number | null {
  if (!match) return null;
  if (match.status === "cancelled") return null;
  if (match.status === "finished") {
    return match.prediction && !match.prediction.processed ? 15000 : null;
  }
  return 5000;
}
