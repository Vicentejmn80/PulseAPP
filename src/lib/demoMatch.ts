export const INNINGS = 9;
export const MS_PER_INNING = 120_000;
export const DEMO_DURATION_MS = INNINGS * MS_PER_INNING;
export const DEMO_MATCH_ID = "demo_caracas_mag";

export const SIMULATOR_BONUS_THRESHOLDS = [
  { minHits: 12, points: 20 },
  { minHits: 10, points: 15 },
  { minHits: 7, points: 10 },
] as const;

export interface DemoEvent {
  inning: number;
  half: "alta" | "baja";
  atMs: number;
  kind: string;
  text: string;
  home: number;
  away: number;
  outs: number;
  bases: number;
}

export interface DemoOption {
  id: string;
  label: string;
}

export interface DemoQuestion {
  id: string;
  atMs: number;
  resolveMs: number;
  prompt: string;
  options: DemoOption[];
  correct: string;
  tone: "main" | "quick";
}

export interface DemoScript {
  seed: string;
  innings: number;
  msPerInning: number;
  finalHome: number;
  finalAway: number;
  events: DemoEvent[];
  questions: DemoQuestion[];
}

export interface PredictionSlice {
  winner: string;
  homeScore: number;
  awayScore: number;
}

export type DemoPhase = "predict" | "ready" | "live" | "finished";

const BASES: Record<number, string> = {
  1: "Corredor en primera.",
  2: "Corredor en segunda.",
  3: "Corredores en primera y segunda.",
  4: "Corredor en tercera, en posición de anotar.",
  5: "Corredores en primera y tercera.",
  6: "Corredores en segunda y tercera.",
  7: "Bases llenas.",
};

export function bonusForHits(hits: number) {
  const safe = Math.max(0, Math.floor(hits));
  const tier = SIMULATOR_BONUS_THRESHOLDS.find((item) => safe >= item.minHits);
  return tier?.points ?? 0;
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function clockAt(elapsedMs: number) {
  const elapsed = Math.max(0, elapsedMs);
  const finished = elapsed >= DEMO_DURATION_MS;
  const bounded = Math.min(elapsed, DEMO_DURATION_MS);
  const inning = finished ? INNINGS : Math.min(INNINGS, Math.floor(bounded / MS_PER_INNING) + 1);
  const into = bounded % MS_PER_INNING;
  const remainingMs = finished ? 0 : MS_PER_INNING - into;
  return {
    inning,
    remainingMs,
    finished,
    progress: Math.min(1, bounded / DEMO_DURATION_MS),
  };
}

export function canStartSimulator(prediction: PredictionSlice | null | undefined) {
  if (!prediction) return false;
  if (!prediction.winner) return false;
  if (!Number.isInteger(prediction.homeScore) || !Number.isInteger(prediction.awayScore)) return false;
  if (prediction.homeScore < 0 || prediction.awayScore < 0) return false;
  if (prediction.homeScore === prediction.awayScore) return false;
  return true;
}

export function beginSimulation(phase: DemoPhase): DemoPhase {
  return phase === "ready" ? "live" : phase;
}

export function gradeAnswer(correct: string, chosen: string | null | undefined) {
  if (!chosen || chosen === "skip") return 0;
  return chosen === correct ? 1 : 0;
}

export function countHits(
  answers: { questionId: string; optionId: string }[],
  questions: { id: string; correct: string }[],
) {
  return answers.reduce((sum, answer) => {
    const question = questions.find((item) => item.id === answer.questionId);
    if (!question) return sum;
    return sum + gradeAnswer(question.correct, answer.optionId);
  }, 0);
}

function closenessPoints(errorTotal: number) {
  if (errorTotal <= 0) return 40;
  if (errorTotal <= 2) return 36;
  if (errorTotal <= 4) return 32;
  if (errorTotal <= 6) return 28;
  if (errorTotal <= 8) return 24;
  if (errorTotal <= 10) return 20;
  if (errorTotal <= 12) return 16;
  if (errorTotal <= 14) return 12;
  if (errorTotal <= 16) return 8;
  if (errorTotal <= 18) return 4;
  return 0;
}

export function predictionPoints(predHome: number, predAway: number, actualHome: number, actualAway: number) {
  const predSide = predHome === predAway ? "" : predHome > predAway ? "home" : "away";
  const actualSide = actualHome === actualAway ? "" : actualHome > actualAway ? "home" : "away";
  const winnerPoints = predSide !== "" && predSide === actualSide ? 40 : 0;
  const errorTotal = Math.abs(predHome - actualHome) + Math.abs(predAway - actualAway);
  const closeness = closenessPoints(errorTotal);
  return {
    winnerPoints,
    closenessPoints: closeness,
    total: Math.min(80, winnerPoints + closeness),
    errorTotal,
    winnerCorrect: winnerPoints === 40,
  };
}

export function experienceSummary(input: {
  predHome: number;
  predAway: number;
  simHome: number;
  simAway: number;
  hits: number;
}) {
  const prediction = predictionPoints(input.predHome, input.predAway, input.simHome, input.simAway);
  const bonus = bonusForHits(input.hits);
  return {
    prediction,
    bonus,
    total: prediction.total + bonus,
    label: "SIMULACIÓN" as const,
  };
}

export function officialMatchAfterSimulation<T extends { homeScore: number | null; awayScore: number | null; status: string }>(
  match: T,
): T {
  return match;
}

export function visibleEvents(events: DemoEvent[], elapsedMs: number) {
  return events.filter((event) => event.atMs <= elapsedMs);
}

export function activeQuestion(
  questions: DemoQuestion[],
  elapsedMs: number,
  answered: Set<string>,
  dismissed: Set<string>,
) {
  const windowFor = (question: DemoQuestion) => (question.tone === "quick" ? 22_000 : 50_000);
  return (
    questions.find((question) => {
      if (answered.has(question.id) || dismissed.has(question.id)) return false;
      return elapsedMs >= question.atMs && elapsedMs < question.atMs + windowFor(question);
    }) ?? null
  );
}

export function publicTascas<T extends { active: boolean }>(rows: T[]) {
  return rows.filter((row) => row.active);
}

export function venueQrPath(slug: string) {
  return `/venue/${slug}`;
}

export function canAccessSuperAdmin(isAdmin: boolean) {
  return isAdmin === true;
}

export function slugify(value: string) {
  const map: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", ü: "u" };
  const folded = value
    .trim()
    .toLowerCase()
    .replace(/[áéíóúñü]/g, (char) => map[char] ?? char);
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "tasca";
}

export function qrTokensUnique(tokens: string[]) {
  return new Set(tokens).size === tokens.length;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function popcount(bases: number) {
  return (bases & 1 ? 1 : 0) + (bases & 2 ? 1 : 0) + (bases & 4 ? 1 : 0);
}

function resolvePlay(roll: number, outs: number, bases: number) {
  if (roll < 22) return { kind: "ponche", text: "Ponche.", outs: outs + 1, bases, runs: 0 };
  if (roll < 46) return { kind: "out", text: "Out al campo.", outs: outs + 1, bases, runs: 0 };
  if (roll < 54) {
    if (bases & 1 && outs < 2) return { kind: "doble_play", text: "Doble play.", outs: outs + 2, bases: bases & ~1, runs: 0 };
    return { kind: "out", text: "Out al campo.", outs: outs + 1, bases, runs: 0 };
  }
  if (roll < 64) {
    let runs = 0;
    let next = bases;
    if ((next & 1) === 0) next |= 1;
    else if ((next & 2) === 0) next |= 3;
    else if ((next & 4) === 0) next = 7;
    else {
      runs = 1;
      next = 7;
    }
    return { kind: "boleto", text: "Base por bolas.", outs, bases: next, runs };
  }
  if (roll < 80) {
    const runs = bases & 4 ? 1 : 0;
    let next = 1;
    if (bases & 2) next |= 4;
    if (bases & 1) next |= 2;
    return { kind: "sencillo", text: "Sencillo.", outs, bases: next, runs };
  }
  if (roll < 90) {
    let runs = 0;
    if (bases & 4) runs += 1;
    if (bases & 2) runs += 1;
    let next = 2;
    if (bases & 1) next |= 4;
    return { kind: "doble", text: "¡Doble!", outs, bases: next, runs };
  }
  if (roll < 95) return { kind: "triple", text: "¡Triple!", outs, bases: 4, runs: popcount(bases) };
  if (roll < 98) return { kind: "jonron", text: "¡Jonrón!", outs, bases: 0, runs: popcount(bases) + 1 };
  if (bases & 1 && (bases & 2) === 0) return { kind: "robo", text: "Robo de segunda.", outs, bases: (bases & ~1) | 2, runs: 0 };
  if (bases & 2 && (bases & 4) === 0) {
    return { kind: "robo", text: "Robo de tercera. Corredor en posición de anotar.", outs, bases: (bases & ~2) | 4, runs: 0 };
  }
  return { kind: "out", text: "Out al campo.", outs: outs + 1, bases, runs: 0 };
}

function scoreThrough(events: DemoEvent[], inning: number) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].inning <= inning) return { home: events[index].home, away: events[index].away };
  }
  return { home: 0, away: 0 };
}

function leaderOf(score: { home: number; away: number }) {
  if (score.home === score.away) return "tie";
  return score.away > score.home ? "away" : "home";
}

function runBucket(runs: number) {
  if (runs <= 0) return "0";
  if (runs === 1) return "1";
  if (runs === 2) return "2";
  return "3";
}

function homerBand(inning: number | null) {
  if (inning === null) return "none";
  if (inning <= 2) return "12";
  if (inning <= 4) return "34";
  if (inning <= 6) return "56";
  return "79";
}

function nextBucket(prev: DemoEvent, next: DemoEvent) {
  if (next.home + next.away > prev.home + prev.away) return "run";
  if (next.kind === "doble" || next.kind === "triple" || next.kind === "jonron") return "xbh";
  if (next.kind === "boleto" || next.kind === "sencillo" || next.kind === "robo") return "base";
  return "out";
}

export function buildDemoScript(seed: string, awayTeam: string, homeTeam: string): DemoScript {
  const random = rng(seed);
  const events: DemoEvent[] = [];
  let home = 0;
  let away = 0;

  for (let inning = 1; inning <= INNINGS; inning += 1) {
    const runsAtStart = home + away;
    for (const half of ["alta", "baja"] as const) {
      let outs = 0;
      let bases = 0;
      const plays: DemoEvent[] = [];
      while (outs < 3 && plays.length < 8) {
        const roll = Math.floor(random() * 100);
        const before = { home, away };
        const result = resolvePlay(roll, outs, bases);
        outs = Math.min(3, result.outs);
        bases = outs >= 3 ? 0 : result.bases;
        if (half === "alta") away += result.runs;
        else home += result.runs;
        let text = result.text;
        if (outs < 3 && result.bases) text = `${text} ${BASES[result.bases] ?? ""}`.trim();
        if (result.runs === 1) text += " Entra una carrera.";
        if (result.runs > 1) text += ` Entran ${result.runs} carreras.`;
        if (result.runs >= 2) text += " Rally ofensivo.";
        const wasAway = before.away > before.home;
        const wasHome = before.home > before.away;
        if ((wasAway && home > away) || (wasHome && away > home)) text += " Cambio de ventaja.";
        if (outs >= 3) text += half === "baja" ? " Final del inning." : " Final de la mitad.";
        plays.push({
          inning,
          half,
          atMs: 0,
          kind: result.kind,
          text: text.replace(/\s+/g, " ").trim(),
          home,
          away,
          outs,
          bases,
        });
      }
      const start = (inning - 1) * MS_PER_INNING + (half === "alta" ? 4_000 : 64_000);
      const span = 52_000;
      plays.forEach((play, index) => {
        events.push({ ...play, atMs: start + Math.floor((index * span) / Math.max(plays.length, 1)) });
      });
    }
    if (home + away === runsAtStart) {
      const last = [...events].reverse().find((event) => event.inning === inning);
      if (last) last.text = `${last.text} Inning sin carreras.`.trim();
    }
  }

  if (home === away) {
    home += 1;
    events.push({
      inning: 9,
      half: "baja",
      atMs: DEMO_DURATION_MS - 5_000,
      kind: "carrera",
      text: "Entra la carrera que define la simulación.",
      home,
      away,
      outs: 2,
      bases: 0,
    });
  }

  const firstHomer = events.find((event) => event.kind === "jonron") ?? null;
  const homerCount = events.filter((event) => event.kind === "jonron").length;
  const nextRunAt = 2 * MS_PER_INNING + 10_000;
  const nextRun = events.find((event, index) => {
    if (event.atMs <= nextRunAt) return false;
    const prev = events[index - 1] ?? { home: 0, away: 0 };
    return event.home + event.away > prev.home + prev.away;
  });
  const inning4Before = scoreThrough(events, 3);
  const inning4After = scoreThrough(events, 4);
  const inning4Runs = inning4After.home + inning4After.away - (inning4Before.home + inning4Before.away);
  const after5 = scoreThrough(events, 5);
  const lead5 = leaderOf(after5);
  const leadChange = leaderOf(scoreThrough(events, 1)) !== "tie" && leaderOf(scoreThrough(events, 6)) !== "tie" && leaderOf(scoreThrough(events, 1)) !== leaderOf(scoreThrough(events, 6));
  const spot = events.find((event) => event.bases === 3 && event.outs === 1) ?? null;

  const teamOptions = [
    { id: "away", label: awayTeam },
    { id: "home", label: homeTeam },
  ];
  const questions: DemoQuestion[] = [
    {
      id: "q_homer",
      atMs: 15_000,
      resolveMs: firstHomer?.atMs ?? DEMO_DURATION_MS - 1_000,
      prompt: "¿En qué inning crees que llegará el primer jonrón?",
      options: [
        { id: "12", label: "1.º–2.º" },
        { id: "34", label: "3.º–4.º" },
        { id: "56", label: "5.º–6.º" },
        { id: "79", label: "7.º–9.º" },
        { id: "none", label: "No habrá jonrón" },
      ],
      correct: homerBand(firstHomer?.inning ?? null),
      tone: "main",
    },
    {
      id: "q_next_run",
      atMs: nextRunAt,
      resolveMs: nextRun?.atMs ?? 3 * MS_PER_INNING - 1_000,
      prompt: "¿Qué equipo anotará la próxima carrera?",
      options: [...teamOptions, { id: "none", label: "Ninguno" }],
      correct: nextRun ? (nextRun.away > (events[events.indexOf(nextRun) - 1]?.away ?? 0) ? "away" : "home") : "none",
      tone: "main",
    },
    {
      id: "q_inning_runs",
      atMs: 3 * MS_PER_INNING + 8_000,
      resolveMs: 4 * MS_PER_INNING - 1_000,
      prompt: "¿Cuántas carreras habrá en este inning?",
      options: [
        { id: "0", label: "0" },
        { id: "1", label: "1" },
        { id: "2", label: "2" },
        { id: "3", label: "3+" },
      ],
      correct: runBucket(inning4Runs),
      tone: "main",
    },
    {
      id: "q_lead5",
      atMs: 4 * MS_PER_INNING + 8_000,
      resolveMs: 5 * MS_PER_INNING - 1_000,
      prompt: "¿Quién llegará con ventaja al final del 5.º inning?",
      options: [...teamOptions, { id: "tie", label: "Empate" }],
      correct: lead5,
      tone: "main",
    },
    {
      id: "q_swing",
      atMs: MS_PER_INNING + 12_000,
      resolveMs: 6 * MS_PER_INNING - 1_000,
      prompt: "¿Habrá cambio de ventaja antes del 7.º inning?",
      options: [
        { id: "si", label: "Sí" },
        { id: "no", label: "No" },
      ],
      correct: leadChange ? "si" : "no",
      tone: "main",
    },
    {
      id: "q_homers",
      atMs: 5 * MS_PER_INNING + 12_000,
      resolveMs: DEMO_DURATION_MS - 1_000,
      prompt: "¿Cuántos jonrones habrá en todo el partido?",
      options: [
        { id: "0", label: "0" },
        { id: "1", label: "1" },
        { id: "2", label: "2" },
        { id: "3", label: "3+" },
      ],
      correct: runBucket(homerCount),
      tone: "main",
    },
  ];

  if (spot) {
    const end = scoreThrough(events, spot.inning);
    const delta = end.home + end.away - (spot.home + spot.away);
    questions.push({
      id: "q_spot",
      atMs: spot.atMs + 2_000,
      resolveMs: spot.inning * MS_PER_INNING - 1_000,
      prompt: `${awayTeam} o ${homeTeam} tienen corredores en 1.ª y 2.ª con un out. ¿Cómo crees que termina este inning?`,
      options: [
        { id: "0", label: "0 carreras" },
        { id: "1", label: "1 carrera" },
        { id: "2", label: "2+ carreras" },
      ],
      correct: runBucket(delta),
      tone: "main",
    });
  }

  for (const inning of [1, 2, 3, 5, 7, 8]) {
    const index = events.findIndex((event) => event.inning === inning && event.half === "alta");
    const current = events[index];
    const next = events[index + 1];
    if (!current || !next) continue;
    questions.push({
      id: `q_quick_${inning}`,
      atMs: current.atMs + 1_500,
      resolveMs: Math.max(current.atMs + 8_000, next.atMs),
      prompt: "¿Qué sigue en esta secuencia?",
      options: [
        { id: "out", label: "Out" },
        { id: "base", label: "Se embasa" },
        { id: "xbh", label: "Extrabase" },
        { id: "run", label: "Carrera" },
      ],
      correct: nextBucket(current, next),
      tone: "quick",
    });
  }

  questions.sort((a, b) => a.atMs - b.atMs);
  return {
    seed,
    innings: INNINGS,
    msPerInning: MS_PER_INNING,
    finalHome: home,
    finalAway: away,
    events,
    questions,
  };
}
