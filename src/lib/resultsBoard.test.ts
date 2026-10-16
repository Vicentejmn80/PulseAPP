import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canSettle, inBucket, newestPage, orderedBucket, resultPreviewLine, winnerFromScores, type BoardGame } from "@/lib/resultsBoard";

const now = Date.parse("2026-10-16T04:16:00.000Z");

function day(isoDay: string, status = "scheduled", homeScore: number | null = null): BoardGame {
  return { id: isoDay, startsAt: `${isoDay}T23:00:00.000Z`, status, homeScore };
}

describe("tablero de resultados", () => {
  const games = [
    day("2026-10-15", "locked"),
    day("2026-10-16"),
    day("2026-10-23"),
    day("2026-11-05"),
    day("2026-10-24", "finished", 4),
  ];

  it("la página de más nuevo a más viejo esconde el 15 oct y la ronda en curso", () => {
    const page = newestPage(games, 2).map((game) => game.id);
    expect(page).toEqual(["2026-11-05", "2026-10-24"]);
    expect(page).not.toContain("2026-10-15");
    expect(page).not.toContain("2026-10-16");
  });

  it("por cargar va del más antiguo al más reciente y próximos no se liquidan", () => {
    expect(orderedBucket(games, "pending", now).map((game) => game.id)).toEqual(["2026-10-15"]);
    expect(orderedBucket(games, "upcoming", now).map((game) => game.id)).toEqual(["2026-10-16", "2026-10-23", "2026-11-05"]);
    expect(orderedBucket(games, "settled", now).map((game) => game.id)).toEqual(["2026-10-24"]);
    expect(canSettle("2026-10-16T23:00:00.000Z", now)).toBe(false);
    expect(canSettle("2026-10-15T23:00:00.000Z", now)).toBe(true);
    expect(inBucket({ id: "x", startsAt: "2026-10-15T23:00:00.000Z", status: "locked", homeScore: null, cycleName: null }, "pending", now)).toBe(true);
  });

  it("el ganador sigue al equipo, no al orden de las cajas", () => {
    const first = winnerFromScores("Leones del Caracas", 3, "Bravos de Margarita", 5);
    const swapped = winnerFromScores("Bravos de Margarita", 5, "Leones del Caracas", 3);
    expect(first).toEqual(swapped);
    expect(resultPreviewLine({
      winner: first?.name ?? "",
      winnerScore: 5,
      otherScore: 3,
      predictions: 12,
      winners: 8,
      exact: 2,
      points: 520,
      zeros: 4,
    })).toContain("Gana Bravos de Margarita 5 – 3");
    expect(resultPreviewLine({
      winner: first?.name ?? "",
      winnerScore: 5,
      otherScore: 3,
      predictions: 12,
      winners: 8,
      exact: 2,
      points: 520,
      zeros: 4,
    })).toContain("4 sumarán 0");
  });

  it("la migración no filtra por ronda y ordena por cargar de antiguo a reciente", () => {
    const sql = readFileSync("supabase/migrations/20261019120000_results_board.sql", "utf8");
    expect(sql).toContain("bucket = 'pending'");
    expect(sql).toContain("m.starts_at asc");
    expect(sql).toContain("then m.starts_at end desc nulls last");
    expect(sql).toContain("Este juego aún no empieza");
    expect(sql).not.toContain("m.round_id");
    expect(sql).not.toContain("ronda_id");
  });
});