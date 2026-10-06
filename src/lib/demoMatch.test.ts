import { describe, expect, it } from "vitest";
import {
  INNINGS,
  MS_PER_INNING,
  DEMO_DURATION_MS,
  SIMULATOR_BONUS_THRESHOLDS,
  activeQuestion,
  beginSimulation,
  bonusForHits,
  buildDemoScript,
  canAccessSuperAdmin,
  canStartSimulator,
  clockAt,
  countHits,
  experienceSummary,
  gradeAnswer,
  officialMatchAfterSimulation,
  publicTascas,
  predictionPoints,
  qrTokensUnique,
  slugify,
  venueQrPath,
} from "@/lib/demoMatch";

const script = buildDemoScript("tasca-demo", "Caracas", "Magallanes");

describe("simulador Juégate el Tobo", () => {
  it("no deja empezar sin pronóstico", () => {
    expect(canStartSimulator(null)).toBe(false);
    expect(canStartSimulator({ winner: "", homeScore: 1, awayScore: 0 })).toBe(false);
    expect(canStartSimulator({ winner: "Caracas", homeScore: 2, awayScore: 2 })).toBe(false);
  });

  it("PLAY BALL solo arranca desde la pantalla lista", () => {
    expect(canStartSimulator({ winner: "Caracas", homeScore: 4, awayScore: 2 })).toBe(true);
    expect(beginSimulation("predict")).toBe("predict");
    expect(beginSimulation("ready")).toBe("live");
  });

  it("arma exactamente 9 innings de 2 minutos", () => {
    expect(INNINGS).toBe(9);
    expect(MS_PER_INNING).toBe(120_000);
    expect(DEMO_DURATION_MS).toBe(18 * 60 * 1000);
    expect(script.innings).toBe(9);
    expect(script.msPerInning).toBe(120_000);
    expect(new Set(script.events.map((event) => event.inning))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    for (const event of script.events) {
      const start = (event.inning - 1) * MS_PER_INNING;
      expect(event.atMs).toBeGreaterThanOrEqual(start);
      expect(event.atMs).toBeLessThan(start + MS_PER_INNING);
    }
  });

  it("hace avanzar el reloj y termina después del inning 9", () => {
    expect(clockAt(0)).toMatchObject({ inning: 1, remainingMs: 120_000, finished: false });
    expect(clockAt(74_000).remainingMs).toBe(46_000);
    expect(clockAt(74_000).inning).toBe(1);
    expect(clockAt(MS_PER_INNING).inning).toBe(2);
    expect(clockAt(DEMO_DURATION_MS - 1).finished).toBe(false);
    expect(clockAt(DEMO_DURATION_MS - 1).inning).toBe(9);
    expect(clockAt(DEMO_DURATION_MS)).toMatchObject({ inning: 9, finished: true, remainingMs: 0 });
  });

  it("deja omitir una pregunta y solo suma el acierto correcto", () => {
    const question = script.questions[0];
    expect(gradeAnswer(question.correct, "skip")).toBe(0);
    expect(gradeAnswer(question.correct, null)).toBe(0);
    expect(gradeAnswer(question.correct, "otra")).toBe(0);
    expect(gradeAnswer(question.correct, question.correct)).toBe(1);
    expect(countHits([{ questionId: question.id, optionId: "skip" }], script.questions)).toBe(0);
    expect(countHits([{ questionId: question.id, optionId: question.correct }], script.questions)).toBe(1);
    const shown = activeQuestion(script.questions, script.questions[0].atMs + 1_000, new Set(), new Set([script.questions[0].id]));
    expect(shown?.id).not.toBe(script.questions[0].id);
  });

  it("calcula el bonus en un solo lugar", () => {
    expect(SIMULATOR_BONUS_THRESHOLDS.map((tier) => [tier.minHits, tier.points])).toEqual([
      [12, 20],
      [10, 15],
      [7, 10],
    ]);
    expect(bonusForHits(0)).toBe(0);
    expect(bonusForHits(6)).toBe(0);
    expect(bonusForHits(7)).toBe(10);
    expect(bonusForHits(9)).toBe(10);
    expect(bonusForHits(10)).toBe(15);
    expect(bonusForHits(11)).toBe(15);
    expect(bonusForHits(12)).toBe(20);
    expect(bonusForHits(14)).toBe(20);
  });

  it("ofrece suficientes momentos para el bonus y un marcador coherente", () => {
    const main = script.questions.filter((question) => question.tone === "main");
    expect(main.length).toBeGreaterThanOrEqual(4);
    expect(main.length).toBeLessThanOrEqual(8);
    expect(script.questions.length).toBeGreaterThanOrEqual(12);
    expect(script.finalHome).not.toBe(script.finalAway);
    let home = 0;
    let away = 0;
    for (const event of script.events) {
      expect(event.home).toBeGreaterThanOrEqual(home);
      expect(event.away).toBeGreaterThanOrEqual(away);
      home = event.home;
      away = event.away;
    }
    const last = script.events[script.events.length - 1];
    expect(last.home).toBe(script.finalHome);
    expect(last.away).toBe(script.finalAway);
  });

  it("suma el pronóstico de la simulación y el bonus sin tocar el resultado oficial", () => {
    const summary = experienceSummary({ predHome: 5, predAway: 3, simHome: 5, simAway: 3, hits: 7 });
    expect(summary.prediction.total).toBe(80);
    expect(summary.bonus).toBe(10);
    expect(summary.total).toBe(90);
    expect(summary.label).toBe("SIMULACIÓN");
    const match = { homeScore: null, awayScore: null, status: "scheduled" };
    expect(officialMatchAfterSimulation(match)).toEqual(match);
  });

  it("aplica exactamente la tabla oficial de puntos del pronóstico", () => {
    const bands = [
      [0, 40], [1, 36], [2, 36], [3, 32], [4, 32], [5, 28], [6, 28],
      [7, 24], [8, 24], [9, 20], [10, 20], [11, 16], [12, 16],
      [13, 12], [14, 12], [15, 8], [16, 8], [17, 4], [18, 4], [19, 0],
    ] as const;
    for (const [error, closePoints] of bands) {
      expect(predictionPoints(20, 0, 20 + error, 0).closenessPoints).toBe(closePoints);
    }
    expect(predictionPoints(5, 3, 5, 3)).toMatchObject({ winnerPoints: 40, closenessPoints: 40, total: 80 });
    expect(predictionPoints(5, 3, 6, 4)).toMatchObject({ winnerPoints: 40, closenessPoints: 36, total: 76, errorTotal: 2 });
    expect(predictionPoints(5, 3, 4, 6)).toMatchObject({ winnerPoints: 0, closenessPoints: 32, total: 32, errorTotal: 4 });
  });

  it("prepara tascas, QR y el acceso del super admin", () => {
    expect(slugify("Tasca San José")).toBe("tasca-san-jose");
    expect(venueQrPath("tasca-san-jose")).toBe("/venue/tasca-san-jose");
    expect(qrTokensUnique(["q-jose", "q-ramon"])).toBe(true);
    expect(qrTokensUnique(["q-jose", "q-jose"])).toBe(false);
    expect(canAccessSuperAdmin(false)).toBe(false);
    expect(canAccessSuperAdmin(true)).toBe(true);
    expect(publicTascas([
      { name: "Activa", active: true },
      { name: "Pausada", active: false },
    ]).map((row) => row.name)).toEqual(["Activa"]);
  });
});
