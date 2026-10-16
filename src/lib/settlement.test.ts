import { describe, expect, it } from "vitest";
import { lvbpStandings, rankDelta } from "@/lib/lvbpStandings";
import { badgeCount, publishScore, userTotal, voidMatch, type SettlePrediction } from "@/lib/settlement";

const startsAt = "2026-10-16T23:00:00.000Z";
const before = "2026-10-16T20:00:00.000Z";
const after = "2026-10-16T23:30:00.000Z";

function prediction(id: string, home: number, away: number, createdAt = before): SettlePrediction {
  return { id, userId: id, home, away, createdAt, startsAt };
}

const five: SettlePrediction[] = [
  prediction("exacto", 6, 3),
  prediction("cerca", 5, 2),
  prediction("lejos", 10, 0),
  prediction("ocho", 10, 7),
  prediction("fallo", 2, 3),
];

const teams = { homeTeam: "Magallanes", awayTeam: "Caracas" };

describe("publicar y liquidar", () => {
  it("reparte 80, 70, 45, 40 y 0, y el mismo marcador no duplica", () => {
    const first = publishScore({ predictions: five, ...teams, home: 6, away: 3 });
    expect(first.ok).toBe(true);
    expect(first.state.awards.map((row) => row.points)).toEqual([80, 70, 45, 40, 0]);
    expect(userTotal(first.state, "exacto")).toBe(80);
    expect(userTotal(first.state, "fallo")).toBe(0);
    expect(first.state.ledger).toHaveLength(5);
    expect(first.state.notices).toHaveLength(5);
    expect(badgeCount(first.state.notices)).toBe(4);
    expect(first.state.notices.find((row) => row.userId === "fallo")?.silent).toBe(true);

    const again = publishScore({ state: first.state, predictions: five, ...teams, home: 6, away: 3 });
    expect(again.idempotent).toBe(true);
    expect(again.scored).toBe(0);
    expect(again.state.ledger).toHaveLength(5);
    expect(again.state.notices).toHaveLength(5);
    expect(userTotal(again.state, "exacto")).toBe(80);
  });

  it("corrige sin duplicar y no avisa a quien sigue igual", () => {
    const first = publishScore({ predictions: five, ...teams, home: 6, away: 3 });
    const titles = new Map(first.state.notices.map((row) => [row.userId, row.title]));
    const corrected = publishScore({ state: first.state, predictions: five, ...teams, home: 5, away: 3 });
    expect(corrected.state.awards.map((row) => [row.userId, row.points])).toEqual([
      ["exacto", 75],
      ["cerca", 75],
      ["lejos", 40],
      ["ocho", 40],
      ["fallo", 0],
    ]);
    expect(userTotal(corrected.state, "exacto")).toBe(75);
    expect(corrected.state.notices).toHaveLength(5);
    expect(corrected.state.notices.find((row) => row.userId === "exacto")?.body).toContain("ahora son 75 (antes 80)");
    expect(corrected.state.notices.find((row) => row.userId === "ocho")?.title).toBe(titles.get("ocho"));
    expect(corrected.state.notices.find((row) => row.userId === "fallo")?.title).toBe(titles.get("fallo"));
    expect(corrected.state.ledger.filter((row) => row.kind === "correct")).toHaveLength(3);
    const net = corrected.state.ledger.filter((row) => row.userId === "exacto").reduce((sum, row) => sum + row.delta, 0);
    expect(net).toBe(75);
  });

  it("anula, revierte y no liquida un empate ni un pronóstico tarde", () => {
    const first = publishScore({ predictions: five, ...teams, home: 6, away: 3 });
    const voided = voidMatch({ state: first.state, predictions: five, ...teams });
    expect(voided.state.status).toBe("cancelled");
    expect(voided.state.awards.every((row) => row.points === 0 && row.voided)).toBe(true);
    expect(userTotal(voided.state, "exacto")).toBe(0);
    expect(voided.state.notices.filter((row) => row.type === "anulado")).toHaveLength(5);
    expect(voided.state.notices.find((row) => row.type === "anulado")?.body).not.toMatch(/0 puntos/);
    const again = voidMatch({ state: voided.state, predictions: five, ...teams });
    expect(again.idempotent).toBe(true);

    const late = publishScore({
      predictions: [prediction("tarde", 6, 3, after)],
      ...teams,
      home: 6,
      away: 3,
    });
    expect(late.state.awards).toHaveLength(0);

    const tied = publishScore({ predictions: five, ...teams, home: 4, away: 4 });
    expect(tied.ok).toBe(false);
    expect(tied.state.awards).toHaveLength(0);
  });

  it("si dos publicaciones llegan juntas, la segunda no vuelve a sumar", () => {
    const first = publishScore({ predictions: five, ...teams, home: 6, away: 3 });
    const blocked = publishScore({ state: first.state, predictions: five, ...teams, home: 7, away: 2, locked: true });
    expect(blocked.ok).toBe(false);
    expect(userTotal(blocked.state, "exacto")).toBe(80);
    const retry = publishScore({ state: first.state, predictions: five, ...teams, home: 6, away: 3 });
    expect(retry.idempotent).toBe(true);
    expect(retry.state.ledger).toHaveLength(5);
  });
});

describe("la tabla se reordena con el marcador", () => {
  const game = {
    homeTeam: "Navegantes del Magallanes",
    awayTeam: "Leones del Caracas",
    status: "finished" as const,
    startsAt,
  };

  it("sube al ganador y, si el marcador se corrige, los vuelve a colocar", () => {
    const published = lvbpStandings([{ ...game, homeScore: 6, awayScore: 3 }]);
    const corrected = lvbpStandings([{ ...game, homeScore: 3, awayScore: 6 }]);
    const voided = lvbpStandings([{ ...game, homeScore: 6, awayScore: 3, status: "cancelled" }]);
    expect(published.rows.find((row) => row.id === "navegantes")?.rank).toBe(1);
    expect(corrected.rows.find((row) => row.id === "leones")?.rank).toBe(1);
    expect(corrected.rows.find((row) => row.id === "navegantes")?.wins).toBe(0);
    expect(voided.countedGames).toBe(0);
    expect(voided.rows.every((row) => row.played === 0)).toBe(true);
    expect(rankDelta(1, 4, 1)).toBe(-3);
    expect(rankDelta(4, 1, 1)).toBe(3);
    expect(rankDelta(2, 2, 1)).toBe(0);
  });
});
