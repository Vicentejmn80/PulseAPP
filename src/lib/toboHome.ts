import { matchPhase, type BaseballMatch, type ToboCycle } from "@/services/matchesApi";

export function caracasDateKey(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Ronda que contiene hoy, si no la próxima, si no la más reciente. */
export function pickActiveCycle(cycles: ToboCycle[], today = caracasDateKey(new Date())) {
  const dated = cycles.filter((cycle) => cycle.startsOn && cycle.endsOn);
  const openNow = dated.find((cycle) => cycle.status === "open" && cycle.startsOn <= today && today <= cycle.endsOn);
  if (openNow) return openNow;
  const spanning = dated.find((cycle) => cycle.startsOn <= today && today <= cycle.endsOn);
  if (spanning) return spanning;
  const upcoming = dated
    .filter((cycle) => cycle.startsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  if (upcoming[0]) return upcoming[0];
  return [...dated].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0] ?? null;
}

/** Asigna un partido por su hora programada de inicio, nunca por la de finalización. */
export function cycleForMatchStart(startsAt: string, cycles: ToboCycle[]) {
  const matchDay = caracasDateKey(startsAt);
  if (!matchDay) return null;
  return cycles.find((cycle) => cycle.startsOn <= matchDay && matchDay <= cycle.endsOn) ?? null;
}

export type HomeMatchTone = "predict" | "saved" | "closed" | "finished" | "live" | "cancelled";

export function homeMatchTone(match: BaseballMatch): HomeMatchTone {
  const phase = matchPhase(match);
  if (phase === "cancelled") return "cancelled";
  if (phase === "finished") return "finished";
  if (phase === "live") return "live";
  if (phase === "locked") return "closed";
  if (match.prediction) return "saved";
  return "predict";
}

/** Juegos de hoy que todavía se pueden pronosticar o seguir (en vivo / editar). */
export function isActionableToday(match: BaseballMatch) {
  const tone = homeMatchTone(match);
  return tone === "predict" || tone === "saved" || tone === "live";
}
