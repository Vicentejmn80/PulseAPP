import { describe, expect, it } from "vitest";
import { CHALLENGE_BANK } from "./catalog";
import { challengeAward, correctOptionId, publicChallengeAnswers, ruleHolds, toggleChallengePick } from "./evaluate";
import { compatibleTemplates, selectChallenges } from "./select";
import { predictionPoints } from "@/lib/demoMatch";
import { hydrateChallengeSelections, selectedChallengeRows, updateChallengeSelection } from "@/lib/challengeSelections";
import type { GameChallenge } from "@/services/matchesApi";
import type { ChallengeTemplate } from "./types";

describe("banco de retos", () => {
  it("contiene al menos 100 plantillas y no repite codes", () => {
    expect(CHALLENGE_BANK.length).toBeGreaterThanOrEqual(100);
    const codes = CHALLENGE_BANK.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("toda plantilla activa tiene regla, opciones y puntos de su dificultad", () => {
    const points: Record<string, number[]> = { easy: [2], medium: [4], hard: [6], expert: [8, 10] };
    for (const template of CHALLENGE_BANK.filter((item) => item.active)) {
      expect(template.scoringRule?.op).toBeTruthy();
      expect(template.options.length).toBeGreaterThanOrEqual(2);
      expect(points[template.difficulty]).toContain(template.points);
      if (template.answerType === "boolean") {
        expect(template.options.map((option) => option.id)).toEqual(["si", "no"]);
      }
      if (template.scoringRule.op === "buckets") {
        const ids = template.scoringRule.buckets?.map((bucket) => bucket.id);
        expect(template.options.map((option) => option.id)).toEqual(ids);
      }
    }
  });
});

describe("selección automática", () => {
  const game = "match_caracas_magallanes";

  it("asigna como máximo 5 retos y es determinista", () => {
    const first = selectChallenges({ templates: CHALLENGE_BANK, gameId: game });
    const second = selectChallenges({ templates: CHALLENGE_BANK, gameId: game });
    expect(first.length).toBeLessThanOrEqual(5);
    expect(first.length).toBeGreaterThan(0);
    expect(first.map((item) => item.code)).toEqual(second.map((item) => item.code));
  });

  it("dos partidos pueden recibir retos distintos y el usuario no cambia la lista", () => {
    const sets = new Set<string>();
    for (let index = 0; index < 24; index += 1) {
      sets.add(selectChallenges({ templates: CHALLENGE_BANK, gameId: `match_${index}` }).map((item) => item.code).join(","));
    }
    expect(sets.size).toBeGreaterThan(1);
    const shared = selectChallenges({ templates: CHALLENGE_BANK, gameId: game });
    expect(shared.map((item) => item.code)).toEqual(selectChallenges({ templates: CHALLENGE_BANK, gameId: game }).map((item) => item.code));
  });

  it("no asigna una plantilla incompatible y degrada si hay pocas", () => {
    const incompatible: ChallengeTemplate = {
      ...CHALLENGE_BANK[0],
      code: "NEEDS_INNINGS",
      requiredFacts: ["innings"],
      active: true,
    };
    const picked = selectChallenges({ templates: [...CHALLENGE_BANK, incompatible], gameId: game });
    expect(picked.some((item) => item.code === "NEEDS_INNINGS")).toBe(false);
    expect(compatibleTemplates([incompatible])).toEqual([]);

    const few = CHALLENGE_BANK.slice(0, 3);
    expect(selectChallenges({ templates: few, gameId: game })).toHaveLength(3);
    expect(selectChallenges({ templates: CHALLENGE_BANK.slice(0, 4), gameId: game })).toHaveLength(4);
  });

  it("evita repetir el partido anterior cuando todavía hay plantillas", () => {
    const first = selectChallenges({ templates: CHALLENGE_BANK, gameId: "partido_a" });
    const second = selectChallenges({
      templates: CHALLENGE_BANK,
      gameId: "partido_b",
      previousCodes: first.map((item) => item.code),
    });
    expect(second.some((item) => first.some((prev) => prev.code === item.code))).toBe(false);
  });
});

describe("evaluación y puntos", () => {
  it("corrige en backend y no deja que el cliente fije puntos ni el acierto", () => {
    const rule = { op: "total_gte" as const, n: 9 };
    expect(correctOptionId(rule, { home: 5, away: 4 })).toBe("si");
    expect(challengeAward(rule, 6, "si", { home: 5, away: 4 })).toEqual({ correct: true, points: 6 });
    expect(challengeAward(rule, 6, "no", { home: 5, away: 4 })).toEqual({ correct: false, points: 0 });
    expect(challengeAward(rule, 6, "si", { home: 2, away: 1 })).toEqual({ correct: false, points: 0 });

    const sent = publicChallengeAnswers([
      { challengeId: "g1", optionId: "si", points: 99, correct: true, isCorrect: true, correctAnswer: "si" },
    ]);
    expect(sent).toEqual([{ challengeId: "g1", optionId: "si" }]);
    expect(JSON.stringify(sent)).not.toContain("99");
  });

  it("un acierto suma el bonus y repetir la clave no vuelve a otorgarlo", () => {
    const ledger = new Map<string, number>();
    const key = "user_1:match_1:gch_1";
    const award = challengeAward({ op: "margin_gte", n: 4 }, 8, "si", { home: 7, away: 2 });
    expect(award.points).toBe(8);
    expect(ledger.has(key)).toBe(false);
    ledger.set(key, award.points);
    const again = challengeAward({ op: "margin_gte", n: 4 }, 8, "si", { home: 7, away: 2 });
    expect(ledger.get(key)).toBe(again.points);
    expect(ledger.size).toBe(1);
  });

  it("un reto incorrecto no otorga puntos", () => {
    expect(challengeAward({ op: "shutout" }, 6, "si", { home: 4, away: 2 }).points).toBe(0);
    expect(ruleHolds({ op: "shutout" }, { home: 5, away: 0 })).toBe(true);
  });

  it("el máximo son 3 retos y el cuarto no borra los anteriores", () => {
    let state = toggleChallengePick([], "a");
    state = toggleChallengePick(state.selected, "b");
    state = toggleChallengePick(state.selected, "c");
    const blocked = toggleChallengePick(state.selected, "d");
    expect(blocked.selected).toEqual(["a", "b", "c"]);
    expect(blocked.notice).toBe("Ya elegiste 3 retos. Cambia uno para seleccionar otro.");
    const swapped = toggleChallengePick(blocked.selected, "a");
    expect(toggleChallengePick(swapped.selected, "d").selected).toEqual(["b", "c", "d"]);
  });

  it("el partido histórico conserva la regla que tenía al asignarse", () => {
    const snapshot = { op: "total_gte" as const, n: 12 };
    const editedLater = { op: "total_gte" as const, n: 1 };
    const score = { home: 4, away: 3 };
    expect(challengeAward(snapshot, 6, "si", score).points).toBe(0);
    expect(challengeAward(editedLater, 6, "si", score).points).toBe(6);
  });

  it("el pronóstico principal sigue en su propia escala de hasta 80", () => {
    expect(predictionPoints(5, 3, 5, 3)).toMatchObject({ winnerPoints: 40, closenessPoints: 40, total: 80 });
    expect(predictionPoints(5, 3, 2, 1).total).toBeLessThanOrEqual(80);
    const bonus = challengeAward({ op: "both_gte", n: 3 }, 4, "no", { home: 5, away: 3 }).points;
    expect(bonus).toBe(0);
    expect(predictionPoints(5, 3, 5, 3).total).toBe(80);
  });
});

describe("selecciones persistidas de retos del partido", () => {
  const board: GameChallenge[] = Array.from({ length: 5 }, (_, index) => ({
    id: `challenge-${index + 1}`,
    position: index + 1,
    points: 1,
    title: `Reto ${index + 1}`,
    description: "",
    category: "juego",
    difficulty: "easy",
    answerType: "boolean",
    options: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }],
    myOption: index < 3 ? "si" : null,
    evaluated: false,
    correct: null,
    pointsAwarded: null,
    correctOption: null,
  }));

  it("hidrata tras volver a la pantalla y resume solo los tres retos guardados", () => {
    const restored = hydrateChallengeSelections(board);
    expect(Object.keys(restored)).toHaveLength(3);
    expect(selectedChallengeRows(board, restored).map((row) => row.id)).toEqual([
      "challenge-1", "challenge-2", "challenge-3",
    ]);
  });

  it("edita una selección, vuelve a hidratar el nuevo estado y no permite más de tres", () => {
    const saved = hydrateChallengeSelections(board);
    const deselected = updateChallengeSelection(saved, "challenge-1", "si");
    const replaced = updateChallengeSelection(deselected.selections, "challenge-4", "no");
    const persistedBoard = board.map((row) => ({
      ...row,
      myOption: replaced.selections[row.id] ?? null,
    }));
    const afterReload = hydrateChallengeSelections(persistedBoard);
    expect(afterReload).toEqual({ "challenge-2": "si", "challenge-3": "si", "challenge-4": "no" });
    expect(selectedChallengeRows(persistedBoard, afterReload)).toHaveLength(3);
    const blocked = updateChallengeSelection(afterReload, "challenge-5", "si");
    expect(blocked.notice).toContain("Ya elegiste 3 retos");
    expect(Object.keys(blocked.selections)).toHaveLength(3);
  });
});
