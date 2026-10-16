import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canSavePrediction, homePredictSection, predictionTabMatches } from "@/lib/matchAgenda";
import type { BaseballMatch } from "@/services/matchesApi";

const now = Date.parse("2026-10-16T20:00:00.000Z");

function game(partial: Partial<BaseballMatch> & Pick<BaseballMatch, "id" | "startsAt">): BaseballMatch {
  return {
    homeTeam: "Leones del Caracas",
    awayTeam: "Bravos de Margarita",
    status: "scheduled",
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
    ...partial,
  };
}

describe("inicio simple", () => {
  const rows = [
    game({ id: "a", startsAt: "2026-10-16T21:00:00.000Z" }),
    game({ id: "b", startsAt: "2026-10-16T22:00:00.000Z" }),
    game({ id: "c", startsAt: "2026-10-16T23:00:00.000Z" }),
    game({ id: "d", startsAt: "2026-10-16T23:30:00.000Z" }),
    game({ id: "live", startsAt: "2026-10-16T18:00:00.000Z", status: "locked" }),
    game({ id: "tomorrow", startsAt: "2026-10-17T23:00:00.000Z" }),
  ];

  it("muestra 3 abiertos de hoy y esconde el que ya empezó", () => {
    const section = homePredictSection(rows, now, false);
    expect(section.title).toBe("Hoy puedes pronosticar");
    expect(section.matches.map((match) => match.id)).toEqual(["a", "b", "c"]);
    expect(section.expandable).toBe(true);
    expect(canSavePrediction(rows[4].startsAt, now)).toBe(false);
  });

  it("ver más llega hasta 6 y el resto va a Pronósticos", () => {
    const extra = game({ id: "e", startsAt: "2026-10-16T23:40:00.000Z" });
    const more = game({ id: "f", startsAt: "2026-10-16T23:50:00.000Z" });
    const seventh = game({ id: "g", startsAt: "2026-10-16T23:55:00.000Z" });
    const section = homePredictSection([...rows, extra, more, seventh], now, true);
    expect(section.matches).toHaveLength(6);
    expect(section.overflow).toBe(true);
  });

  it("si hoy ya cerró, muestra el próximo día", () => {
    const section = homePredictSection(rows.filter((match) => match.id === "tomorrow" || match.id === "live"), now, false);
    expect(section.title).toBe("Próximos juegos");
    expect(section.matches.map((match) => match.id)).toEqual(["tomorrow"]);
  });
});

describe("pronósticos en dos listas", () => {
  const saved = {
    id: "p",
    winner: "Bravos de Margarita",
    homeScore: 3,
    awayScore: 5,
    lockedAt: null,
    processed: false,
    winnerPoints: null,
    closenessPoints: null,
    total: null,
    errorTotal: null,
  };

  it("un juego iniciado sin pronóstico no aparece; con pronóstico espera resultado", () => {
    const rows = [
      game({ id: "open", startsAt: "2026-10-16T23:00:00.000Z" }),
      game({ id: "silent", startsAt: "2026-10-16T18:00:00.000Z", status: "locked" }),
      game({ id: "waiting", startsAt: "2026-10-16T18:30:00.000Z", status: "locked", prediction: saved }),
      game({ id: "done", startsAt: "2026-10-15T23:00:00.000Z", status: "finished", homeScore: 3, awayScore: 5 }),
      game({ id: "void", startsAt: "2026-10-16T19:00:00.000Z", status: "cancelled" }),
    ];
    expect(predictionTabMatches(rows, "pronosticar", now).map((match) => match.id)).toEqual(["open"]);
    expect(predictionTabMatches(rows, "finalizados", now).map((match) => match.id)).toEqual(["waiting", "done"]);
  });

  it("el servidor rechaza un pronóstico cuando el juego ya empezó", () => {
    const sql = readFileSync("supabase/migrations/20260929180000_demo_experience.sql", "utf8");
    expect(sql).toContain("not match.is_demo and match.starts_at <= now()");
    expect(sql).toContain("El juego ya comenzó. El pronóstico está cerrado.");
  });
});
