import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countsBeforeStart,
  maxPoints,
  pointsHint,
  scoreBands,
  scoreNotice,
  scorePair,
  scorePrediction,
  welcomeBody,
  TIE_PREDICTION_ERROR,
  TIE_RESULT_ERROR,
} from "@/config/scoring";

const home = "Magallanes";
const away = "Caracas";

describe("calcular puntos", () => {
  it("cubre los cuatro casos del PDF", () => {
    expect(scorePrediction(6, 3, 6, 3)).toMatchObject({ errorTotal: 0, winnerPoints: 40, closenessPoints: 40, total: 80, hitWinner: true });
    expect(scorePrediction(5, 2, 6, 3)).toMatchObject({ errorTotal: 2, closenessPoints: 30, total: 70, hitWinner: true });
    expect(scorePrediction(2, 3, 6, 3)).toMatchObject({ hitWinner: false, winnerPoints: 0, closenessPoints: 0, total: 0 });
    expect(scorePrediction(10, 7, 6, 3)).toMatchObject({ errorTotal: 8, closenessPoints: 0, total: 40, hitWinner: true });
  });

  it("no baja de 40 si acertó el ganador y no pasa de 80", () => {
    expect(scorePrediction(10, 0, 6, 3)).toMatchObject({ errorTotal: 7, closenessPoints: 5, total: 45 });
    expect(scorePrediction(15, 3, 6, 3)).toMatchObject({ errorTotal: 9, total: 40, closenessPoints: 0 });
    expect(scorePrediction(16, 13, 6, 3)).toMatchObject({ errorTotal: 20, total: 40 });
    expect(scorePrediction(6, 3, 6, 3).total).toBeLessThanOrEqual(maxPoints());
  });

  it("trata local y visitante al revés, el empate y el 0–0 como sin ganador", () => {
    expect(scorePrediction(3, 6, 6, 3).total).toBe(0);
    expect(scorePrediction(0, 0, 6, 3)).toMatchObject({ tiedPrediction: true, total: 0, hitWinner: false });
    expect(scorePrediction(4, 4, 6, 3).total).toBe(0);
    expect(scorePrediction(6, 3, 4, 4)).toMatchObject({ tiedResult: true, total: 0 });
    expect(scorePrediction(3, 6, 2, 5)).toMatchObject({ hitWinner: true, errorTotal: 2, total: 70 });
  });

  it("arma la tabla desde las mismas constantes", () => {
    const bands = scoreBands();
    expect(bands[0]).toEqual({ error: "0", closeness: 40, total: 80 });
    expect(bands.find((row) => row.error === "2")).toEqual({ error: "2", closeness: 30, total: 70 });
    expect(bands.find((row) => row.error === "7")).toEqual({ error: "7", closeness: 5, total: 45 });
    expect(bands.at(-1)).toEqual({ error: "8 o más", closeness: 0, total: 40 });
    expect(welcomeBody()).toContain("hasta 80 puntos");
    expect(pointsHint()).toBe("Hasta 80 pts · ganador +40 · cercanía hasta +40");
  });

  it("solo cuenta un pronóstico hecho antes del inicio", () => {
    expect(countsBeforeStart("2026-10-16T22:00:00.000Z", "2026-10-16T23:00:00.000Z")).toBe(true);
    expect(countsBeforeStart("2026-10-16T23:00:00.000Z", "2026-10-16T23:00:00.000Z")).toBe(false);
    expect(countsBeforeStart("2026-10-16T23:30:00.000Z", "2026-10-16T23:00:00.000Z")).toBe(false);
  });
});

describe("textos de la campanita", () => {
  const predictionLine = scorePair(home, 6, away, 3);
  const resultLine = predictionLine;

  it("usa el desglose real y deja el cero en silencio", () => {
    expect(scoreNotice({
      points: 80, error: 0, base: 40, closeness: 40, predictionLine, resultLine, matchLabel: "Caracas vs Magallanes",
    })).toMatchObject({ title: "¡Marcador exacto! 🎯 +80 puntos", body: "Clavaste Magallanes 6 – Caracas 3.", silent: false });

    expect(scoreNotice({
      points: 70, error: 2, base: 40, closeness: 30, predictionLine: scorePair(home, 5, away, 2), resultLine, matchLabel: "x",
    }).title).toBe("¡Felicidades! 🎉 +70 puntos");

    expect(scoreNotice({
      points: 75, error: 1, base: 40, closeness: 35, predictionLine, resultLine, matchLabel: "x",
    }).body).toContain("1 carrera");

    expect(scoreNotice({
      points: 55, error: 5, base: 40, closeness: 15, predictionLine, resultLine, matchLabel: "x",
    })).toMatchObject({ title: "¡Vas muy bien! 🔥 +55 puntos", body: "Acertaste el ganador (+40) y tu marcador sumó +15." });

    expect(scoreNotice({
      points: 40, error: 8, base: 40, closeness: 0, predictionLine, resultLine, matchLabel: "x",
    }).title).toBe("¡Vas por buen camino! 👏 +40 puntos");

    const miss = scoreNotice({
      points: 0, error: 4, base: 0, closeness: 0, predictionLine: scorePair(home, 2, away, 3), resultLine, matchLabel: "x",
    });
    expect(miss.silent).toBe(true);
    expect(miss.title).toBe("Esta vez no sumaste");
    expect(miss.body).toContain("Magallanes 2 – Caracas 3");
    expect(miss.body).not.toContain("0 puntos");
  });

  it("avisa la corrección y la anulación sin hablar de cero puntos", () => {
    const fixed = scoreNotice({
      points: 40, previous: 80, error: 8, base: 40, closeness: 0, predictionLine, resultLine, matchLabel: "Caracas vs Magallanes",
    });
    expect(fixed.body).toBe("Se corrigió el resultado de Caracas vs Magallanes. Tus puntos para este juego ahora son 40 (antes 80).");
    expect(fixed.silent).toBe(false);
    const voided = scoreNotice({
      points: 0, error: 0, base: 0, closeness: 0, predictionLine, resultLine, matchLabel: "Caracas vs Magallanes", voided: true,
    });
    expect(voided.body).toBe("Se anuló Caracas vs Magallanes. Tu pronóstico queda sin efecto.");
    expect(voided.body).not.toMatch(/0 puntos/);
  });
});

describe("la migración usa la misma regla", () => {
  const sql = readFileSync("supabase/migrations/20261019000000_scoring_notifications.sql", "utf8");

  it("deja la fórmula, el empate y la campanita en el servidor", () => {
    expect(sql).toContain("closeness_points - error_step * v_error");
    expect(sql).toContain("v_hit");
    expect(sql).toContain(TIE_PREDICTION_ERROR);
    expect(sql).toContain(TIE_RESULT_ERROR);
    expect(sql).toContain("for update");
    expect(sql).toContain("¡Marcador exacto! 🎯 +");
    expect(sql).toContain("Esta vez no sumaste");
    expect(sql).toContain("Se corrigió el resultado de ");
    expect(sql).toContain("Tu pronóstico queda sin efecto.");
    expect(sql).toContain("created_at < game.starts_at");
    expect(sql).not.toContain("when p_error <= 2 then 36");
  });
});
