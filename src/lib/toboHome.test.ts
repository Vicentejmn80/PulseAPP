import { describe, expect, it } from "vitest";
import type { BaseballMatch, ToboCycle } from "@/services/matchesApi";
import { caracasDateKey, cycleClosesLabel, cycleForMatchStart, cyclePeriodLabel, homeMatchTone, isActionableToday, pickActiveCycle } from "@/lib/toboHome";

function match(partial: Partial<BaseballMatch>): BaseballMatch {
  return {
    id: "m",
    homeTeam: "Local",
    awayTeam: "Visitante",
    startsAt: "2026-10-12T23:00:00.000Z",
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

const cycles: ToboCycle[] = [
  { id: "ronda_1", name: "Ronda 1", startsOn: "2026-10-12", endsOn: "2026-10-22", status: "open" },
  { id: "ronda_2", name: "Ronda 2", startsOn: "2026-10-23", endsOn: "2026-10-29", status: "open" },
  { id: "ronda_3", name: "Ronda 3", startsOn: "2026-10-30", endsOn: "2026-11-05", status: "open" },
];

describe("tobo home", () => {
  it("elige la ronda que contiene el día", () => {
    expect(pickActiveCycle(cycles, "2026-10-14")?.id).toBe("ronda_1");
    expect(pickActiveCycle(cycles, "2026-10-22")?.id).toBe("ronda_1");
    expect(pickActiveCycle(cycles, "2026-10-23")?.id).toBe("ronda_2");
    expect(pickActiveCycle(cycles, "2026-11-05")?.id).toBe("ronda_3");
  });

  it("si hoy cae antes de la temporada, muestra la próxima ronda", () => {
    expect(pickActiveCycle(cycles, "2026-10-04")?.id).toBe("ronda_1");
  });

  it("asigna al ciclo por fecha/hora de inicio en Caracas, incluyendo el cierre del 22 de octubre", () => {
    expect(cycleForMatchStart("2026-10-23T03:00:00.000Z", cycles)?.id).toBe("ronda_1");
    expect(cycleForMatchStart("2026-10-23T04:00:00.000Z", cycles)?.id).toBe("ronda_2");
    expect(cycleForMatchStart("2026-11-06T04:00:00.000Z", cycles)).toBeNull();
  });

  it("separa pronóstico abierto, guardado, cerrado y final", () => {
    const future = "2099-01-01T23:00:00.000Z";
    expect(homeMatchTone(match({ startsAt: future }))).toBe("predict");
    expect(homeMatchTone(match({ startsAt: future, prediction: { id: "p", winner: "Local", homeScore: 3, awayScore: 1, lockedAt: null, processed: false, winnerPoints: null, closenessPoints: null, total: null, errorTotal: null } }))).toBe("saved");
    expect(homeMatchTone(match({ status: "locked" }))).toBe("closed");
    expect(homeMatchTone(match({ status: "finished", homeScore: 4, awayScore: 2 }))).toBe("finished");
    expect(isActionableToday(match({ startsAt: future }))).toBe(true);
    expect(isActionableToday(match({ status: "finished" }))).toBe(false);
  });

  it("normaliza el día en Caracas", () => {
    expect(caracasDateKey("2026-10-13T02:30:00.000Z")).toBe("2026-10-12");
  });

  it("etiqueta la ronda 1 del 12 al 22 de octubre y deja intactas las siguientes", () => {
    expect(cyclePeriodLabel(cycles[0])).toBe("RONDA 1 · 12 OCT — 22 OCT");
    expect(cycleClosesLabel(cycles[0].endsOn)).toBe("Cierra el 22 de octubre de 2026 · 23:59");
    expect(cyclePeriodLabel(cycles[1])).toBe("RONDA 2 · 23 OCT — 29 OCT");
    expect(cyclePeriodLabel(cycles[2])).toBe("RONDA 3 · 30 OCT — 5 NOV");
    expect(cycles[1]).toMatchObject({ startsOn: "2026-10-23", endsOn: "2026-10-29" });
    expect(cycles[2]).toMatchObject({ startsOn: "2026-10-30", endsOn: "2026-11-05" });
  });
});
