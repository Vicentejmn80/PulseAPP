import { describe, expect, it } from "vitest";
import { formatWinPct, lvbpStandings } from "@/lib/lvbpStandings";

describe("clasificación LVBP", () => {
  it("cuenta una sola vez cada final y comparte puesto si el porcentaje es igual", () => {
    const result = lvbpStandings([
      { homeTeam: "Caracas", awayTeam: "Magallanes", homeScore: 5, awayScore: 3, status: "finished" },
      { homeTeam: "Caracas", awayTeam: "Magallanes", homeScore: 5, awayScore: 3, status: "finished" },
      { homeTeam: "La Guaira", awayTeam: "Margarita", homeScore: 2, awayScore: 1, status: "finished" },
      { homeTeam: "Caracas", awayTeam: "Magallanes", homeScore: 4, awayScore: 4, status: "finished" },
      { homeTeam: "Zulia", awayTeam: "Lara", homeScore: 1, awayScore: 0, status: "scheduled" },
      { homeTeam: "Demo A", awayTeam: "Demo B", homeScore: 9, awayScore: 0, status: "finished", demo: true },
    ]);
    expect(result.countedGames).toBe(3);
    expect(result.excludedTies).toBe(1);
    const caracas = result.rows.find((row) => row.team === "Caracas");
    const magallanes = result.rows.find((row) => row.team === "Magallanes");
    const guaira = result.rows.find((row) => row.team === "La Guaira");
    expect(caracas).toMatchObject({ played: 2, wins: 2, losses: 0, rank: 1 });
    expect(magallanes).toMatchObject({ played: 2, wins: 0, losses: 2 });
    expect(guaira?.winPct).toBe(1);
    expect(guaira?.rank).toBe(caracas?.rank);
    expect(formatWinPct(caracas?.winPct ?? null)).toBe("1.000");
    expect(result.rows.some((row) => row.team.startsWith("Demo"))).toBe(false);
    expect(caracas?.streak).toBe("G2");
    expect(magallanes?.streak).toBe("P2");
  });

  it("no inventa una fila para un partido sin marcador", () => {
    const result = lvbpStandings([
      { homeTeam: "Caracas", awayTeam: "Lara", homeScore: null, awayScore: null, status: "finished" },
    ]);
    expect(result.rows).toEqual([]);
    expect(result.countedGames).toBe(0);
  });

  it("toma la racha del último final, no del primero", () => {
    const result = lvbpStandings([
      { homeTeam: "Caracas", awayTeam: "Magallanes", homeScore: 5, awayScore: 1, status: "finished", startsAt: "2026-10-02T00:00:00Z" },
      { homeTeam: "Caracas", awayTeam: "Magallanes", homeScore: 0, awayScore: 3, status: "finished", startsAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(result.rows.find((row) => row.team === "Caracas")?.streak).toBe("G1");
    expect(result.rows.find((row) => row.team === "Magallanes")?.streak).toBe("P1");
  });
});
