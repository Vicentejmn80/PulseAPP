import type {
  InningStart,
  SimulationFrame,
  SimulationHalf,
  SimulationMoment,
  SimulationScript,
  MatchClock,
  ActiveMoment,
  ResolvedMoment,
} from "@/lib/simulation/types";

/**
 * Motor de reproduccion de la simulacion.
 *
 * Regla central: el motor NO genera jugadas. Solo lee el guion guardado y dice
 * que esta pasando en un segundo dado. Por eso la misma demo se reproduce
 * siempre igual, sin Math.random y sin depender del servidor.
 */

export function secondsPerInning(script: SimulationScript) {
  return Math.max(1, script.secondsPerInning);
}

export function totalSeconds(script: SimulationScript) {
  return secondsPerInning(script) * script.innings;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function inningWindow(script: SimulationScript, inning: number) {
  const size = secondsPerInning(script);
  return { start: (inning - 1) * size, end: inning * size };
}

export function clockAt(script: SimulationScript, elapsedSeconds: number): MatchClock {
  const size = secondsPerInning(script);
  const total = totalSeconds(script);
  const elapsed = clamp(elapsedSeconds, 0, total);
  const finished = elapsed >= total;
  const inning = finished
    ? script.innings
    : clamp(Math.floor(elapsed / size) + 1, 1, script.innings);
  const start = (inning - 1) * size;
  const into = finished ? size : clamp(elapsed - start, 0, size);
  const half = halfAt(script, inning, into);

  return {
    inning,
    half,
    into,
    remainingMs: Math.max(0, Math.round((size - into) * 1000)),
    progress: total === 0 ? 1 : elapsed / total,
    finished,
  };
}

/**
 * En que media entrada estamos. El guion ubica la alta y la baja en rangos
 * disjuntos, asi que basta con la primera jugada de la baja.
 */
export function halfAt(
  script: SimulationScript,
  inning: number,
  into: number,
): SimulationHalf {
  const opening = script.timeline.find(
    (event) => event.inning === inning && event.half === "baja",
  );
  if (!opening) return "alta";
  return into >= opening.at ? "baja" : "alta";
}

function lastEventAt(script: SimulationScript, inning: number, into: number) {
  const events = script.timeline.filter((event) => event.inning === inning && event.at <= into);
  const last = events.length ? events[events.length - 1] : null;
  if (last) return last;
  // Al entrar a un inning todavia no ha ocurrido nada: heredamos del anterior.
  let previous = null as (typeof script.timeline)[number] | null;
  for (const event of script.timeline) {
    if (event.inning > inning) break;
    if (event.inning < inning) previous = event;
  }
  return previous;
}

function inningStartAt(script: SimulationScript, inning: number): InningStart | null {
  return script.inningStarts.find((item) => item.inning === inning) ?? null;
}

/**
 * Estado del marcador al entrar DIRECTO a un inning.
 *
 * Esto es lo que hace posible saltar al 7.o sin reproducir el 1.o al 6.o:
 * el marcador no se inventa, se lee del ultimo evento que quedo antes.
 */
export function stateAtInning(script: SimulationScript, inning: number) {
  const target = clamp(Math.round(inning), 1, script.innings);
  const start = inningWindow(script, target).start;
  const previous = lastEventAt(script, target, 0);
  const before = script.timeline.filter((event) => event.inning === target && event.at <= 0).pop() ?? null;
  const anchor = before ?? previous;
  return {
    inning: target,
    score: {
      home: anchor?.home ?? 0,
      away: anchor?.away ?? 0,
    },
    start,
    meta: inningStartAt(script, target),
  };
}

/**
 * Momento activo en un instante dado.
 *
 * Se cierra cuando vence la ventana O cuando se resuelve, lo que ocurra
 * primero: un momento nunca acepta respuestas despues de revelarse.
 */
export function activeMoment(
  script: SimulationScript,
  clock: MatchClock,
  answers: Record<string, string>,
  dismissed: Record<string, boolean>,
): ActiveMoment | null {
  const found = script.moments.find((moment) => {
    if (dismissed[moment.id]) return false;
    if (moment.inning !== clock.inning || moment.half !== clock.half) return false;
    if (clock.into < moment.at) return false;
    const closesAt = Math.min(moment.at + moment.window, moment.resolveAt);
    return clock.into < closesAt;
  });
  if (!found) return null;
  return { moment: found, answer: answers[found.id] ?? null, dismissed: false };
}

/** Momento ya resuelto que todavía estamos explicando en pantalla. */
export function resolvedMoment(
  script: SimulationScript,
  clock: MatchClock,
  answers: Record<string, string>,
  revealed: Record<string, boolean>,
): ResolvedMoment | null {
  for (let index = script.moments.length - 1; index >= 0; index -= 1) {
    const moment = script.moments[index];
    if (moment.inning !== clock.inning) continue;
    if (moment.half !== clock.half) continue;
    if (clock.into < moment.resolveAt) continue;
    if (clock.into > moment.resolveAt + 12) continue;
    if (!revealed[moment.id]) continue;
    const answer = answers[moment.id] ?? null;
    return { moment, answer, hit: answer !== null && answer === moment.correct };
  }
  return null;
}

/**
 * Estado completo en un instante. Es la unica funcion que la UI necesita
 * para dibujar: marcador, inning, evento, momento y progreso.
 */
export function frameAt(
  script: SimulationScript,
  elapsedSeconds: number,
  answers: Record<string, string> = {},
  dismissed: Record<string, boolean> = {},
  revealed: Record<string, boolean> = {},
): SimulationFrame {
  const clock = clockAt(script, elapsedSeconds);
  const event = lastEventAt(script, clock.inning, clock.into);
  const opening = inningStartAt(script, clock.inning);

  return {
    clock,
    score: {
      home: event?.home ?? opening?.home ?? 0,
      away: event?.away ?? opening?.away ?? 0,
    },
    outs: clock.finished ? 3 : event?.outs ?? 0,
    bases: clock.finished ? 0 : event?.bases ?? 0,
    event,
    inning: opening,
    moment: activeMoment(script, clock, answers, dismissed),
    resolution: resolvedMoment(script, clock, answers, revealed),
  };
}

/** Segundo exacto al que hay que saltar para caer en un momento. */
export function seekToMoment(script: SimulationScript, momentId: string) {
  const moment = script.moments.find((item) => item.id === momentId);
  if (!moment) return null;
  const { start } = stateAtInning(script, moment.inning);
  return start + moment.at;
}

/** Saltar al inning elegido entrando por su presentacion. */
export function seekToInning(script: SimulationScript, inning: number) {
  const target = clamp(Math.round(inning), 1, script.innings);
  return stateAtInning(script, target).start;
}

export function momentStatus(
  moment: SimulationMoment,
  clock: MatchClock,
  answer: string | undefined,
): "pending" | "open" | "answered" | "resolved" | "missed" {
  if (moment.inning !== clock.inning || moment.half !== clock.half) {
    return clock.into > moment.resolveAt + 12 ? "resolved" : "pending";
  }
  if (clock.into >= moment.resolveAt) return "resolved";
  const closesAt = Math.min(moment.at + moment.window, moment.resolveAt);
  if (clock.into >= closesAt) return "missed";
  if (clock.into >= moment.at) return answer ? "answered" : "open";
  return "pending";
}

/** Resumen final de la experiencia. Nunca mezcla el resultado oficial. */
export function summarize(
  script: SimulationScript,
  answers: Record<string, string>,
) {
  const answered = script.moments.filter((moment) => answers[moment.id]);
  const correct = answered.filter((moment) => answers[moment.id] === moment.correct);
  const momentBonus = correct.reduce((sum, moment) => sum + moment.bonus, 0);
  return {
    correct: correct.length,
    total: script.moments.length,
    answered: answered.length,
    momentBonus,
    finalHome: script.finalHome,
    finalAway: script.finalAway,
  };
}
