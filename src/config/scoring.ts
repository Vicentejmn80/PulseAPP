/**
 * Fórmula y textos de pronóstico.
 * En producción los puntos los calcula solo `pulse_score_breakdown` (SQL),
 * leyendo `pulse_scoring_config`. Este archivo es la misma regla para la
 * explicación, los textos de la campanita y las pruebas.
 * Si cambias 40 / 40 / 5, cámbialo también en esa tabla.
 */

export const SCORE_RULES = {
  winnerPoints: 40,
  closenessPoints: 40,
  errorStep: 5,
} as const;

export type ScoreRules = {
  winnerPoints: number;
  closenessPoints: number;
  errorStep: number;
};

export const TIE_PREDICTION_ERROR = "Elige un ganador: el marcador no puede quedar empatado";
export const TIE_RESULT_ERROR = "En béisbol no hay empates, revisa el marcador";

export type ScoreBreakdown = {
  winnerPoints: number;
  closenessPoints: number;
  errorTotal: number;
  total: number;
  hitWinner: boolean;
  tiedPrediction: boolean;
  tiedResult: boolean;
};

export function maxPoints(rules: ScoreRules = SCORE_RULES) {
  return rules.winnerPoints + rules.closenessPoints;
}

export function scoreBands(rules: ScoreRules = SCORE_RULES) {
  const last = Math.floor(rules.closenessPoints / rules.errorStep);
  const rows: { error: string; closeness: number; total: number }[] = [];
  for (let error = 0; error < last; error += 1) {
    const closeness = rules.closenessPoints - rules.errorStep * error;
    rows.push({ error: String(error), closeness, total: rules.winnerPoints + closeness });
  }
  rows.push({ error: `${last} o más`, closeness: 0, total: rules.winnerPoints });
  return rows;
}

/** Única fórmula. Enteros. Si el ganador no coincide, el total es 0. */
export function scorePrediction(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number,
  rules: ScoreRules = SCORE_RULES,
): ScoreBreakdown {
  const tiedPrediction = predHome === predAway;
  const tiedResult = realHome === realAway;
  const errorTotal = Math.abs(predHome - realHome) + Math.abs(predAway - realAway);
  const hitWinner = !tiedPrediction && !tiedResult && (predHome > predAway) === (realHome > realAway);
  const winnerPoints = hitWinner ? rules.winnerPoints : 0;
  const closenessPoints = hitWinner ? Math.max(0, rules.closenessPoints - rules.errorStep * errorTotal) : 0;
  return {
    winnerPoints,
    closenessPoints,
    errorTotal,
    total: winnerPoints + closenessPoints,
    hitWinner,
    tiedPrediction,
    tiedResult,
  };
}

export function countsBeforeStart(createdAt: string, startsAt: string) {
  const created = Date.parse(createdAt);
  const starts = Date.parse(startsAt);
  return Number.isFinite(created) && Number.isFinite(starts) && created < starts;
}

export function chosenWinner(homeTeam: string, homeScore: number, awayTeam: string, awayScore: number) {
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? homeTeam : awayTeam;
}

export function scorePair(homeTeam: string, homeScore: number, awayTeam: string, awayScore: number) {
  return `${homeTeam} ${homeScore} – ${awayTeam} ${awayScore}`;
}

export function welcomeBody(rules: ScoreRules = SCORE_RULES) {
  const max = maxPoints(rules);
  return `Pronostica los juegos de la LVBP y suma hasta ${max} puntos por partido: ${rules.winnerPoints} por acertar el ganador y hasta ${rules.closenessPoints} adicionales según qué tan cerca estés del marcador final. ¡Acumula puntos, sube en el ranking y compite por premios cada semana! 🏆`;
}

export function pointsHint(rules: ScoreRules = SCORE_RULES) {
  return `Hasta ${maxPoints(rules)} pts · ganador +${rules.winnerPoints} · cercanía hasta +${rules.closenessPoints}`;
}

export type ScoreNotice = {
  type: "resultado" | "anulado";
  title: string;
  body: string;
  silent: boolean;
};

export function scoreNotice(input: {
  points: number;
  previous?: number | null;
  error: number;
  base: number;
  closeness: number;
  closenessCap?: number;
  predictionLine: string;
  resultLine: string;
  matchLabel: string;
  voided?: boolean;
}): ScoreNotice {
  if (input.voided) {
    return {
      type: "anulado",
      title: "Juego anulado",
      body: `Se anuló ${input.matchLabel}. Tu pronóstico queda sin efecto.`,
      silent: false,
    };
  }
  if (input.previous !== null && input.previous !== undefined && input.previous !== input.points) {
    return {
      type: "resultado",
      title: "Resultado corregido",
      body: `Se corrigió el resultado de ${input.matchLabel}. Tus puntos para este juego ahora son ${input.points} (antes ${input.previous}).`,
      silent: false,
    };
  }
  if (input.points >= 80) {
    return {
      type: "resultado",
      title: `¡Marcador exacto! 🎯 +${input.points} puntos`,
      body: `Clavaste ${input.predictionLine}.`,
      silent: false,
    };
  }
  if (input.points >= 70) {
    const runs = input.error === 1 ? "carrera" : "carreras";
    return {
      type: "resultado",
      title: `¡Felicidades! 🎉 +${input.points} puntos`,
      body: `Acertaste el ganador y quedaste a ${input.error} ${runs} del marcador.`,
      silent: false,
    };
  }
  if (input.points >= 50) {
    return {
      type: "resultado",
      title: `¡Vas muy bien! 🔥 +${input.points} puntos`,
      body: `Acertaste el ganador (+${input.base}) y tu marcador sumó +${input.closeness}.`,
      silent: false,
    };
  }
  if (input.points >= 40) {
    const cap = input.closenessCap ?? SCORE_RULES.closenessPoints;
    return {
      type: "resultado",
      title: `¡Vas por buen camino! 👏 +${input.points} puntos`,
      body: `Acertaste el ganador (+${input.base}). Acércate más al marcador para sumar hasta ${cap} extra.`,
      silent: false,
    };
  }
  return {
    type: "resultado",
    title: "Esta vez no sumaste",
    body: `Tu pronóstico fue ${input.predictionLine}, terminó ${input.resultLine}. ¡El próximo juego es tuyo!`,
    silent: true,
  };
}
