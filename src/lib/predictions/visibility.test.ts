import { describe, expect, it } from "vitest";
import { matchPhase, type BaseballMatch, type MatchPrediction } from "@/services/matchesApi";
import {
  mergeMatchWithSavedPrediction,
  recentFinishedWithPrediction,
  settlementPollIntervalMs,
  settlementState,
} from "@/lib/predictions/visibility";

function prediction(overrides: Partial<MatchPrediction> = {}): MatchPrediction {
  return {
    id: "pred_1",
    winner: "Leones del Caracas",
    homeScore: 5,
    awayScore: 3,
    lockedAt: null,
    processed: false,
    winnerPoints: null,
    closenessPoints: null,
    total: null,
    errorTotal: null,
    ...overrides,
  };
}

function match(overrides: Partial<BaseballMatch> = {}): BaseballMatch {
  return {
    id: "lvbp_20261012_1900_tib_mag",
    homeTeam: "Navegantes del Magallanes",
    awayTeam: "Tiburones de La Guaira",
    startsAt: "2026-10-12T19:00:00-04:00",
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
    ...overrides,
  };
}

describe("settlementState", () => {
  it("partido finalizado con pronóstico liquidado muestra marcador y puntos", () => {
    const m = match({
      status: "finished",
      homeScore: 5,
      awayScore: 3,
      prediction: prediction({ processed: true, winnerPoints: 40, closenessPoints: 40, total: 80, errorTotal: 0 }),
    });
    expect(settlementState(m)).toBe("settled");
    expect(m.prediction?.total).toBe(80);
  });

  it("partido finalizado con liquidación pendiente conserva el pronóstico y marca pendiente", () => {
    const m = match({
      status: "finished",
      homeScore: 6,
      awayScore: 4,
      prediction: prediction({ processed: false, total: null }),
    });
    expect(settlementState(m)).toBe("pending");
    // El pronóstico sigue presente: la UI debe mostrarlo, no ocultarlo.
    expect(m.prediction?.homeScore).toBe(5);
    expect(m.prediction?.total).toBeNull();
  });

  it("finalizado sin pronóstico no tiene nada que liquidar", () => {
    expect(settlementState(match({ status: "finished", homeScore: 2, awayScore: 1 }))).toBe("none");
  });

  it("partido abierto o bloqueado no reporta liquidación", () => {
    expect(settlementState(match({ status: "scheduled", startsAt: "2099-01-01T19:00:00-04:00" }))).toBe("none");
    expect(settlementState(match({ status: "locked", prediction: prediction() }))).toBe("none");
  });
});

describe("recentFinishedWithPrediction", () => {
  it("los pronósticos de días anteriores siguen accesibles, del más reciente al más antiguo", () => {
    const old = match({ id: "old", status: "finished", startsAt: "2026-10-12T19:00:00-04:00", prediction: prediction({ id: "p-old" }) });
    const newer = match({ id: "new", status: "finished", startsAt: "2026-10-14T19:00:00-04:00", prediction: prediction({ id: "p-new" }) });
    const open = match({ id: "open", status: "scheduled", startsAt: "2099-01-01T19:00:00-04:00", prediction: prediction({ id: "p-open" }) });
    const finishedNoPick = match({ id: "nopick", status: "finished", startsAt: "2026-10-15T19:00:00-04:00" });
    const result = recentFinishedWithPrediction([old, open, finishedNoPick, newer], 10);
    expect(result.map((m) => m.id)).toEqual(["new", "old"]);
  });

  it("respeta el límite", () => {
    const rows = [1, 2, 3, 4].map((day) =>
      match({ id: `m${day}`, status: "finished", startsAt: `2026-10-${10 + day}T19:00:00-04:00`, prediction: prediction({ id: `p${day}` }) }),
    );
    expect(recentFinishedWithPrediction(rows, 3)).toHaveLength(3);
  });
});

describe("mergeMatchWithSavedPrediction", () => {
  it("un refetch sin predicción no elimina la predicción guardada", () => {
    const current = match({ prediction: prediction({ id: "pred_real" }) });
    const fresh = match({ prediction: null, lastEventText: "actualizado" });
    const merged = mergeMatchWithSavedPrediction(current, fresh);
    expect(merged.prediction?.id).toBe("pred_real");
    expect(merged.lastEventText).toBe("actualizado");
  });

  it("un refetch con predicción usa los datos frescos", () => {
    const current = match({ prediction: prediction({ id: "pred_old", total: null }) });
    const fresh = match({ prediction: prediction({ id: "pred_old", processed: true, total: 76 }) });
    const merged = mergeMatchWithSavedPrediction(current, fresh);
    expect(merged.prediction?.total).toBe(76);
    expect(merged.prediction?.processed).toBe(true);
  });

  it("sin estado actual devuelve el partido fresco", () => {
    const fresh = match({ prediction: prediction() });
    expect(mergeMatchWithSavedPrediction(null, fresh)).toBe(fresh);
  });

  it("conserva los IDs de pronósticos ya guardados", () => {
    const current = match({ prediction: prediction({ id: "pred_abc123" }) });
    const merged = mergeMatchWithSavedPrediction(current, match({ prediction: null }));
    expect(merged.prediction?.id).toBe("pred_abc123");
  });
});

describe("settlementPollIntervalMs", () => {
  it("terminado y liquidado o cancelado no hace polling", () => {
    expect(settlementPollIntervalMs(match({ status: "finished", prediction: prediction({ processed: true, total: 80 }) }))).toBeNull();
    expect(settlementPollIntervalMs(match({ status: "finished" }))).toBeNull();
    expect(settlementPollIntervalMs(match({ status: "cancelled" }))).toBeNull();
    expect(settlementPollIntervalMs(null)).toBeNull();
  });

  it("terminado con liquidación pendiente sigue consultando con intervalo largo", () => {
    expect(settlementPollIntervalMs(match({ status: "finished", prediction: prediction({ processed: false }) }))).toBe(15000);
  });

  it("partidos en curso mantienen el intervalo actual", () => {
    expect(settlementPollIntervalMs(match({ status: "scheduled", startsAt: "2099-01-01T19:00:00-04:00" }))).toBe(5000);
    expect(settlementPollIntervalMs(match({ status: "in_progress" }))).toBe(5000);
  });
});

describe("reglas de pronóstico vigentes", () => {
  it("los partidos próximos siguen permitiendo pronosticar", () => {
    const m = match({ status: "scheduled", startsAt: "2099-01-01T19:00:00-04:00" });
    expect(matchPhase(m)).toBe("open");
  });

  it("los partidos bloqueados no permiten modificar el pronóstico", () => {
    const byStatus = match({ status: "locked", prediction: prediction() });
    expect(matchPhase(byStatus)).toBe("locked");
    const byTime = match({ status: "scheduled", startsAt: "2020-01-01T19:00:00-04:00" });
    expect(matchPhase(byTime)).toBe("locked");
  });
});
