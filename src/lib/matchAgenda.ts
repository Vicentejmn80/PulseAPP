import { caracasDateKey } from "@/lib/toboHome";
import type { BaseballMatch } from "@/services/matchesApi";

export type AgendaState = "abierto" | "en_juego" | "finalizado" | "anulado";

/** Misma regla que public.pulse_match_state. `now` debe ser la hora del servidor. */
export function agendaState(match: Pick<BaseballMatch, "status" | "startsAt">, now: number): AgendaState {
  if (match.status === "cancelled") return "anulado";
  if (match.status === "finished") return "finalizado";
  const start = Date.parse(match.startsAt);
  if (Number.isFinite(start) && start > now) return "abierto";
  return "en_juego";
}

export function canSavePrediction(startsAt: string, now: number) {
  const start = Date.parse(startsAt);
  return Number.isFinite(start) && start > now;
}

export function dayHeading(value: string | number) {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Caracas",
  }).format(date).replace(/\./g, "").toUpperCase();
}

export function clockLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });
}

function real(matches: BaseballMatch[]) {
  return matches.filter((match) => !match.demo && !match.simulation);
}

export interface HomePredict {
  title: string;
  matches: BaseballMatch[];
  expandable: boolean;
  overflow: boolean;
  nextLabel: string | null;
}

/** Solo partidos que aún no empiezan. Tres compactos, o seis si el usuario pide más. */
export function homePredictSection(matches: BaseballMatch[], now: number, expanded: boolean): HomePredict {
  const open = real(matches)
    .filter((match) => agendaState(match, now) === "abierto")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const today = caracasDateKey(now);
  const todayRows = open.filter((match) => caracasDateKey(match.startsAt) === today);
  const nextDay = open.map((match) => caracasDateKey(match.startsAt)).find((key) => key > today) ?? "";
  const source = todayRows.length > 0 ? todayRows : open.filter((match) => caracasDateKey(match.startsAt) === nextDay);
  const cap = expanded ? 6 : 3;
  const next = open[0] ?? null;
  return {
    title: todayRows.length > 0 ? "Hoy puedes pronosticar" : "Próximos juegos",
    matches: source.slice(0, cap),
    expandable: !expanded && source.length > 3,
    overflow: source.length > 6,
    nextLabel: source.length === 0 && next ? `${dayHeading(next.startsAt)} a las ${clockLabel(next.startsAt)}` : null,
  };
}

export interface AgendaGroup {
  key: string;
  label: string;
  matches: BaseballMatch[];
}

export type PredictionTab = "pronosticar" | "finalizados";

export function predictionTabMatches(matches: BaseballMatch[], tab: PredictionTab, now: number) {
  const rows = real(matches).filter((match) => agendaState(match, now) !== "anulado");
  if (tab === "pronosticar") {
    return rows.filter((match) => agendaState(match, now) === "abierto").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return rows
    .filter((match) => agendaState(match, now) === "finalizado" || (agendaState(match, now) === "en_juego" && match.prediction))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export function groupByDay(matches: BaseballMatch[]): AgendaGroup[] {
  const groups = new Map<string, BaseballMatch[]>();
  for (const match of matches) {
    const key = caracasDateKey(match.startsAt) || "sin-fecha";
    const list = groups.get(key) ?? [];
    list.push(match);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, label: dayHeading(list[0]?.startsAt ?? key), matches: list }));
}

export function pageSlice<T>(rows: T[], page: number, size: number) {
  const count = Math.max(1, page) * size;
  return { rows: rows.slice(0, count), hasMore: rows.length > count };
}
