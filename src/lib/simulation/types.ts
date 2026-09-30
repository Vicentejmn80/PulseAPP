/**
 * Tipos del motor de experiencia de Pulse.
 *
 * El guion (SimulationScript) llega completo desde el servidor. Aqui solo se
 * define como se reproduce. Un guion mas adelante es otro documento con la
 * misma forma, no otro motor.
 */

export type SimulationHalf = "alta" | "baja";

/** Clases de reacción visual. El motor no decide cómo se ve, solo qué pasó. */
export type ReactionKind = "calm" | "cheer" | "tense" | "turn" | "climax";

export type SimulationEventKind =
  | "inning_start"
  | "strike"
  | "ball"
  | "ponche"
  | "out"
  | "hit"
  | "doble"
  | "triple"
  | "jonron"
  | "error"
  | "robo"
  | "doble_play"
  | "carrera"
  | "cambio"
  | "pausa";

export interface SimulationEvent {
  inning: number;
  half: SimulationHalf;
  /** Segundos dentro del inning. 0 es el pitche inicial. */
  at: number;
  kind: SimulationEventKind;
  reaction: ReactionKind;
  text: string;
  /** Marcador de la simulación DESPUÉS de este evento. */
  home: number;
  away: number;
  outs: number;
  /** Máscara de bases: 1 primera, 2 segunda, 4 tercera. */
  bases: number;
}

export type MomentDifficulty = "facil" | "medio" | "fan";

export interface MomentOption {
  id: string;
  label: string;
}

export interface SimulationMoment {
  id: string;
  inning: number;
  half: SimulationHalf;
  at: number;
  kind: string;
  title: string;
  headline: string;
  /** Tono de la situación. No contiene datos: esos van en `state`. */
  lead: string;
  /** Situación real leída del guion: "corredores en 1.ª y 2.ª, un out". */
  state: string;
  /** Marcador en el instante del momento: "5 - 3". */
  score: string;
  prompt: string;
  options: MomentOption[];
  correct: string;
  difficulty: MomentDifficulty;
  /** Segundos que el momento permanece abierto. */
  window: number;
  /** Segundo en que se resuelve y se revela la respuesta. */
  resolveAt: number;
  bonus: number;
}

export interface InningStart {
  inning: number;
  home: number;
  away: number;
  title: string;
  subtitle: string;
}

/** El documento que el servidor guarda y el cliente reproduce. */
export interface SimulationScript {
  id: string;
  name: string;
  description: string;
  tension: string;
  innings: number;
  secondsPerInning: number;
  finalHome: number;
  finalAway: number;
  inningStarts: InningStart[];
  timeline: SimulationEvent[];
  moments: SimulationMoment[];
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  tension: string;
  innings: number;
  secondsPerInning: number;
  finalHome: number;
  finalAway: number;
  script: SimulationScript;
}

// --- Estado que se calcula a partir del guion -------------------------------

export interface MatchClock {
  inning: number;
  half: SimulationHalf;
  /** Segundos transcurridos dentro del inning. */
  into: number;
  /** Segundos que faltan para el final del inning. */
  remainingMs: number;
  /** 0 a 1 en todo el partido. */
  progress: number;
  finished: boolean;
}

export interface SimulationFrame {
  clock: MatchClock;
  score: { home: number; away: number };
  outs: number;
  bases: number;
  /** Último evento ya ocurrido. */
  event: SimulationEvent | null;
  inning: InningStart | null;
  /** Momento que se debe mostrar ahora mismo, si hay. */
  moment: ActiveMoment | null;
  /** Momento ya resuelto que todavía se está explicando. */
  resolution: ResolvedMoment | null;
}

export interface ActiveMoment {
  moment: SimulationMoment;
  /** Opción ya elegida por el jugador, si la eligió. */
  answer: string | null;
  dismissed: boolean;
}

export interface ResolvedMoment {
  moment: SimulationMoment;
  answer: string | null;
  hit: boolean;
}

export type MomentStatus = "pending" | "open" | "answered" | "resolved" | "missed";

export type SimulationSpeed = 0.25 | 0.5 | 1 | 2 | 4;

export const SPEEDS: SimulationSpeed[] = [0.25, 0.5, 1, 2, 4];

/** Bono de la experiencia. El pronóstico oficial nunca se mezcla aquí. */
export const EXPERIENCE_BONUS_TIERS = [
  { minCorrect: 4, points: 10 },
  { minCorrect: 3, points: 5 },
] as const;

export function experienceBonus(correct: number, momentBonus: number) {
  const tier = EXPERIENCE_BONUS_TIERS.find((item) => correct >= item.minCorrect);
  return { accuracy: tier?.points ?? 0, moments: momentBonus, total: (tier?.points ?? 0) + momentBonus };
}
