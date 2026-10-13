import { describe, expect, it } from "vitest";
import type { BaseballMatch } from "@/services/matchesApi";
import { closesInLabel, visibleRetoGames } from "@/lib/retoFlow";

function game(id: string, startsAt: string, status: BaseballMatch["status"] = "scheduled"): BaseballMatch {
  return {
    id,
    homeTeam: "Local",
    awayTeam: `Visita ${id}`,
    startsAt,
    status,
    homeScore: null,
    awayScore: null,
    inning: 1,
    half: "alta",
    outs: 0,
    featured: false,
    lastEventText: "",
    simulation: false,
    demo: false,
    prediction: null,
  };
}

describe("selector de juegos para retos", () => {
  const now = Date.parse("2026-10-12T12:00:00-04:00");

  it("muestra solo pronósticos abiertos, ordenados, y oculta el resto tras Ver más", () => {
    const rows = [
      game("late", "2026-10-14T19:00:00-04:00"),
      game("done", "2026-10-13T19:00:00-04:00", "finished"),
      game("soon", "2026-10-12T19:00:00-04:00"),
      game("mid", "2026-10-13T19:00:00-04:00"),
      game("past", "2026-10-11T19:00:00-04:00"),
      game("d", "2026-10-15T19:00:00-04:00"),
      game("e", "2026-10-16T19:00:00-04:00"),
    ];
    const folded = visibleRetoGames(rows, false, now);
    expect(folded.visible.map((match) => match.id)).toEqual(["soon", "mid", "late", "d"]);
    expect(folded.hidden).toBe(1);
    expect(visibleRetoGames(rows, true, now).visible).toHaveLength(5);
    expect(closesInLabel("2026-10-12T19:00:00-04:00", now)).toBe("cierra en 7 h");
  });
});
