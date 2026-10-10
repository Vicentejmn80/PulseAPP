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

/**
 * Cierre inclusive de cada ronda, en America/Caracas.
 * Es el mismo instante que `pulse_admin_close_round`:
 * `(ends_on + time '23:59:59') at time zone 'America/Caracas'`.
 * La interfaz muestra el minuto 23:59; el segundo 59 evita cerrar un minuto antes.
 */
export const CYCLE_CLOSE_TIME = "23:59";

const CYCLE_MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"] as const;
const CYCLE_MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] as const;

export function parseCycleDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Día de calendario de una ronda, p. ej. "12 OCT". Sale de starts_on/ends_on, no de un texto fijo. */
export function cycleDayTag(isoDate: string) {
  const parts = parseCycleDate(isoDate);
  if (!parts) return isoDate;
  return `${parts.day} ${CYCLE_MONTHS_SHORT[parts.month - 1]}`;
}

/** Etiqueta de período, p. ej. "RONDA 1 · 12 OCT — 22 OCT". */
export function cyclePeriodLabel(cycle: { name: string; startsOn: string; endsOn: string }) {
  const name = cycle.name.trim().toLocaleUpperCase("es");
  return `${name} · ${cycleDayTag(cycle.startsOn)} — ${cycleDayTag(cycle.endsOn)}`;
}

/** Cierre legible del último día, p. ej. "Cierra el 22 de octubre de 2026 · 23:59". */
export function cycleClosesLabel(endsOn: string) {
  const parts = parseCycleDate(endsOn);
  if (!parts) return `Cierra · ${CYCLE_CLOSE_TIME}`;
  const month = CYCLE_MONTHS_LONG[parts.month - 1];
  return `Cierra el ${parts.day} de ${month} de ${parts.year} · ${CYCLE_CLOSE_TIME}`;
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

/** Ronda que ya está en curso. Null si hoy cae antes o después de todas. */
export function cycleContainingToday(cycles: ToboCycle[], today = caracasDateKey(new Date())) {
  return cycles.find((cycle) => cycle.startsOn && cycle.endsOn && cycle.startsOn <= today && today <= cycle.endsOn) ?? null;
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
