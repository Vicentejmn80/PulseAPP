/**
 * Modelo de la liquidación para las pruebas.
 * La que corre en el servidor es `pulse_admin_set_result`: una transacción,
 * la fila `prediction` guarda el saldo vigente y el ranking es la suma de
 * `pulse_transactions`. Las correcciones dejan el delta en `pulse_score_ledger`
 * para no sumar dos veces.
 */
import {
  countsBeforeStart,
  scoreNotice,
  scorePair,
  scorePrediction,
  TIE_RESULT_ERROR,
  type ScoreRules,
  SCORE_RULES,
} from "@/config/scoring";

export type SettlePrediction = {
  id: string;
  userId: string;
  home: number;
  away: number;
  createdAt: string;
  startsAt: string;
};

export type LedgerRow = {
  predictionId: string;
  userId: string;
  kind: "settle" | "correct" | "void";
  previous: number;
  next: number;
  delta: number;
};

export type NoticeRow = {
  userId: string;
  predictionId: string;
  type: "resultado" | "anulado";
  title: string;
  body: string;
  silent: boolean;
  points: number;
  read: boolean;
};

export type AwardRow = {
  predictionId: string;
  userId: string;
  points: number;
  base: number;
  closeness: number;
  error: number;
  hit: boolean;
  voided: boolean;
};

export type SettleState = {
  status: "open" | "finished" | "cancelled";
  home: number | null;
  away: number | null;
  awards: AwardRow[];
  ledger: LedgerRow[];
  notices: NoticeRow[];
  audits: number;
};

export type SettleResult = {
  ok: boolean;
  error?: string;
  scored: number;
  points: number;
  idempotent: boolean;
  state: SettleState;
};

function blank(): SettleState {
  return { status: "open", home: null, away: null, awards: [], ledger: [], notices: [], audits: 0 };
}

function awardOf(state: SettleState, id: string) {
  return state.awards.find((row) => row.predictionId === id) ?? null;
}

function upsertNotice(state: SettleState, next: NoticeRow) {
  const index = state.notices.findIndex((row) => row.userId === next.userId && row.predictionId === next.predictionId && row.type === next.type);
  if (index === -1) {
    state.notices.push(next);
    return;
  }
  const current = state.notices[index];
  if (current.points === next.points && current.title === next.title && current.type === next.type) return;
  state.notices[index] = { ...next, read: false };
}

/** Las de 0 puntos van en silencio: no suman al badge. */
export function badgeCount(notices: NoticeRow[]) {
  return notices.filter((row) => !row.read && !row.silent).length;
}

export function publishScore(input: {
  state?: SettleState;
  predictions: SettlePrediction[];
  homeTeam: string;
  awayTeam: string;
  home: number;
  away: number;
  rules?: ScoreRules;
  locked?: boolean;
}): SettleResult {
  const rules = input.rules ?? SCORE_RULES;
  const state = input.state ?? blank();
  if (input.locked) {
    return { ok: false, error: "Otro administrador está publicando este juego.", scored: 0, points: 0, idempotent: false, state };
  }
  if (!Number.isInteger(input.home) || !Number.isInteger(input.away) || input.home < 0 || input.away < 0) {
    return { ok: false, error: "Escribe un marcador entero, desde cero.", scored: 0, points: 0, idempotent: false, state };
  }
  if (input.home === input.away) {
    return { ok: false, error: TIE_RESULT_ERROR, scored: 0, points: 0, idempotent: false, state };
  }
  if (state.status === "cancelled") {
    return { ok: false, error: "Un juego anulado no se liquida.", scored: 0, points: 0, idempotent: false, state };
  }
  if (state.status === "finished" && state.home === input.home && state.away === input.away) {
    return { ok: true, scored: 0, points: 0, idempotent: true, state };
  }
  const label = `${input.awayTeam} vs ${input.homeTeam}`;
  const resultLine = scorePair(input.homeTeam, input.home, input.awayTeam, input.away);
  let scored = 0;
  let points = 0;
  for (const prediction of input.predictions) {
    if (!countsBeforeStart(prediction.createdAt, prediction.startsAt)) continue;
    const breakdown = prediction.home === prediction.away
      ? { total: 0, winnerPoints: 0, closenessPoints: 0, errorTotal: Math.abs(prediction.home - input.home) + Math.abs(prediction.away - input.away), hitWinner: false }
      : scorePrediction(prediction.home, prediction.away, input.home, input.away, rules);
    const previous = awardOf(state, prediction.id);
    const oldPoints = previous?.points ?? null;
    const row: AwardRow = {
      predictionId: prediction.id,
      userId: prediction.userId,
      points: breakdown.total,
      base: breakdown.winnerPoints,
      closeness: breakdown.closenessPoints,
      error: breakdown.errorTotal,
      hit: breakdown.hitWinner,
      voided: false,
    };
    if (!previous) state.awards.push(row);
    else Object.assign(previous, row);
    points += breakdown.total;
    if (oldPoints === null || oldPoints !== breakdown.total) {
      scored += 1;
      state.ledger.push({
        predictionId: prediction.id,
        userId: prediction.userId,
        kind: oldPoints === null ? "settle" : "correct",
        previous: oldPoints ?? 0,
        next: breakdown.total,
        delta: breakdown.total - (oldPoints ?? 0),
      });
      const notice = scoreNotice({
        points: breakdown.total,
        previous: oldPoints,
        error: breakdown.errorTotal,
        base: breakdown.winnerPoints,
        closeness: breakdown.closenessPoints,
        closenessCap: rules.closenessPoints,
        predictionLine: scorePair(input.homeTeam, prediction.home, input.awayTeam, prediction.away),
        resultLine,
        matchLabel: label,
      });
      upsertNotice(state, {
        userId: prediction.userId,
        predictionId: prediction.id,
        type: notice.type,
        title: notice.title,
        body: notice.body,
        silent: notice.silent,
        points: breakdown.total,
        read: false,
      });
    }
  }
  state.status = "finished";
  state.home = input.home;
  state.away = input.away;
  state.audits += 1;
  return { ok: true, scored, points, idempotent: false, state };
}

export function voidMatch(input: {
  state: SettleState;
  predictions: SettlePrediction[];
  homeTeam: string;
  awayTeam: string;
}): SettleResult {
  const state = input.state;
  if (state.status === "cancelled") {
    return { ok: true, scored: 0, points: 0, idempotent: true, state };
  }
  const label = `${input.awayTeam} vs ${input.homeTeam}`;
  let scored = 0;
  for (const prediction of input.predictions) {
    const current = awardOf(state, prediction.id);
    const previous = current?.points ?? 0;
    if (current && !current.voided) {
      if (previous !== 0) scored += 1;
      state.ledger.push({
        predictionId: prediction.id,
        userId: prediction.userId,
        kind: "void",
        previous,
        next: 0,
        delta: -previous,
      });
      current.points = 0;
      current.voided = true;
    }
    const notice = scoreNotice({
      points: 0,
      error: 0,
      base: 0,
      closeness: 0,
      predictionLine: "",
      resultLine: "",
      matchLabel: label,
      voided: true,
    });
    const resultado = state.notices.find((row) => row.predictionId === prediction.id && row.type === "resultado");
    if (resultado) resultado.read = true;
    upsertNotice(state, {
      userId: prediction.userId,
      predictionId: prediction.id,
      type: "anulado",
      title: notice.title,
      body: notice.body,
      silent: false,
      points: 0,
      read: false,
    });
  }
  state.status = "cancelled";
  state.audits += 1;
  return { ok: true, scored, points: 0, idempotent: false, state };
}

export function userTotal(state: SettleState, userId: string) {
  return state.awards.filter((row) => row.userId === userId).reduce((sum, row) => sum + row.points, 0);
}
