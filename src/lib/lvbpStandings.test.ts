import { describe, expect, it } from "vitest";
import { formatWinPct, lvbpStandings } from "@/lib/lvbpStandings";

describe("clasificación LVBP", () => {
  it("siempre lista los ocho equipos y separa por victorias si el porcentaje empata", () => {
    const result = lvbpStandings([
      { homeTeam: "Leones del Caracas", awayTeam: "Navegantes del Magallanes", homeScore: 5, awayScore: 3, status: "finished" },
      { homeTeam: "Leones del Caracas", awayTeam: "Navegantes del Magallanes", homeScore: 5, awayScore: 3, status: "finished" },
      { homeTeam: "Tiburones de La Guaira", awayTeam: "Bravos de Margarita", homeScore: 2, awayScore: 1, status: "finished" },
      { homeTeam: "Leones del Caracas", awayTeam: "Navegantes del Magallanes", homeScore: 4, awayScore: 4, status: "finished" },
      { homeTeam: "Águilas del Zulia", awayTeam: "Cardenales de Lara", homeScore: 1, awayScore: 0, status: "scheduled" },
      { homeTeam: "Demo A", awayTeam: "Demo B", homeScore: 9, awayScore: 0, status: "finished", demo: true },
    ]);
    expect(result.rows).toHaveLength(8);
    expect(result.countedGames).toBe(3);
    expect(result.excludedTies).toBe(1);
    const leones = result.rows.find((row) => row.id === "leones");
    const navegantes = result.rows.find((row) => row.id === "navegantes");
    const tiburones = result.rows.find((row) => row.id === "tiburones");
    expect(leones).toMatchObject({ played: 2, wins: 2, losses: 0, rank: 1, streak: "G2", home: "2-0", away: "0-0", last10: "2-0" });
    expect(navegantes).toMatchObject({ played: 2, wins: 0, losses: 2, away: "0-2", streak: "P2" });
    expect(tiburones?.winPct).toBe(1);
    expect(tiburones?.rank).toBe(2);
    expect(formatWinPct(leones?.winPct ?? null)).toBe("1.000");
    expect(result.rows.filter((row) => row.played === 0).every((row) => row.streak === "-" && row.last10 === "-" && row.home === "0-0")).toBe(true);
  });

  it("muestra los ocho en cero cuando todavía no hay marcador", () => {
    const result = lvbpStandings([
      { homeTeam: "Leones del Caracas", awayTeam: "Cardenales de Lara", homeScore: null, awayScore: null, status: "finished" },
    ]);
    expect(result.rows).toHaveLength(8);
    expect(result.countedGames).toBe(0);
    expect(result.rows.every((row) => row.played === 0 && row.rank === 1)).toBe(true);
  });

  it("toma la racha del último final y separa casa de ruta", () => {
    const result = lvbpStandings([
      { homeTeam: "Tigres de Aragua", awayTeam: "Leones del Caracas", homeScore: 1, awayScore: 4, status: "finished", startsAt: "2026-10-01T00:00:00Z" },
      { homeTeam: "Leones del Caracas", awayTeam: "Navegantes del Magallanes", homeScore: 3, awayScore: 2, status: "finished", startsAt: "2026-10-02T00:00:00Z" },
      { homeTeam: "Bravos de Margarita", awayTeam: "Tigres de Aragua", homeScore: 6, awayScore: 1, status: "finished", startsAt: "2026-10-03T00:00:00Z" },
    ]);
    expect(result.rows.find((row) => row.id === "leones")).toMatchObject({ streak: "G2", home: "1-0", away: "1-0", last10: "2-0", rank: 1 });
    expect(result.rows.find((row) => row.id === "bravos")).toMatchObject({ streak: "G1", home: "1-0", away: "0-0", last10: "1-0" });
    expect(result.rows.find((row) => row.id === "tigres")).toMatchObject({ streak: "P2", home: "0-1", away: "0-1", last10: "0-2" });
    expect(result.rows.find((row) => row.id === "navegantes")).toMatchObject({ streak: "P1", home: "0-0", away: "0-1" });
  });
});
