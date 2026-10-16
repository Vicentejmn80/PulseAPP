export interface BoardGame {
  id: string;
  startsAt: string;
  status: string;
  homeScore: number | null;
  cycleName?: string | null;
}

export type ResultBucket = "pending" | "upcoming" | "settled";

/** La página vieja (más nuevo primero, 40) escondía la ronda en curso. */
export function newestPage(games: BoardGame[], limit: number) {
  return [...games].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, limit);
}

export function inBucket(game: BoardGame, bucket: ResultBucket, now: number) {
  const start = Date.parse(game.startsAt);
  if (bucket === "settled") return game.status === "finished";
  if (game.status === "finished" || game.status === "cancelled") return false;
  if (bucket === "pending") return Number.isFinite(start) && start <= now && game.homeScore === null;
  return Number.isFinite(start) && start > now;
}

export function orderedBucket(games: BoardGame[], bucket: ResultBucket, now: number) {
  const rows = games.filter((game) => inBucket(game, bucket, now));
  rows.sort((a, b) => bucket === "settled" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt));
  return rows;
}

export function canSettle(startsAt: string, now: number) {
  const start = Date.parse(startsAt);
  return Number.isFinite(start) && start <= now;
}

export const EARLY_RESULT_ERROR = "Este juego aún no empieza. No se puede cargar el resultado todavía.";
export const MODAL_TIE_ERROR = "En béisbol no hay empates. Revisa el marcador";
export const SCORE_CAP = 50;

export function resultPreviewLine(input: {
  winner: string;
  winnerScore: number;
  otherScore: number;
  predictions: number;
  winners: number;
  exact: number;
  points: number;
  zeros: number;
}) {
  return `Gana ${input.winner} ${input.winnerScore} – ${input.otherScore} · ${input.predictions} pronósticos · ${input.winners} aciertan el ganador · ${input.exact} marcador exacto · se repartirán +${input.points} puntos a ${input.winners} usuarios (${input.zeros} sumarán 0)`;
}

export function winnerFromScores(homeTeam: string, home: number, awayTeam: string, away: number) {
  if (home === away) return null;
  if (home > away) return { name: homeTeam, winnerScore: home, otherScore: away };
  return { name: awayTeam, winnerScore: away, otherScore: home };
}
