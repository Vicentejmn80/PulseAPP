import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeMoment,
  clockAt,
  frameAt,
  momentStatus,
  seekToInning,
  seekToMoment,
  stateAtInning,
  summarize,
  totalSeconds,
} from "@/lib/simulation/engine";
import { experienceBonus } from "@/lib/simulation/types";
import type { SimulationScript } from "@/lib/simulation/types";

/**
 * Los guiones se leen del mismo archivo que genera la migracion SQL, para que
 * los tests prueben exactamente lo que se guarda en la base.
 */
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260929190000_sim_scenarios.sql"),
  "utf8",
);

function loadScripts(): Record<string, SimulationScript> {
  const pattern = /'(\{[\s\S]*?\})'::jsonb/g;
  const scripts: Record<string, SimulationScript> = {};
  for (const match of migration.matchAll(pattern)) {
    const doc = JSON.parse(match[1].replace(/''/g, "'")) as SimulationScript;
    scripts[doc.id] = doc;
  }
  return scripts;
}

const scripts = loadScripts();
const cerrado = scripts.cerrado;
const ultimo = scripts.ultimo;
const remontada = scripts.remontada;

describe("motor de experiencia", () => {
  it("carga los tres escenarios desde la migracion", () => {
    expect(Object.keys(scripts).sort()).toEqual(["cerrado", "remontada", "ultimo"]);
    for (const script of Object.values(scripts)) {
      expect(script.innings).toBe(9);
      expect(script.secondsPerInning).toBe(120);
      expect(script.timeline.length).toBeGreaterThan(80);
      expect(script.moments.length).toBeGreaterThanOrEqual(4);
      expect(script.inningStarts).toHaveLength(9);
    }
  });

  it("dura 18 minutos: 9 innings de 2 minutos", () => {
    expect(totalSeconds(cerrado)).toBe(18 * 60);
    expect(clockAt(cerrado, 0)).toMatchObject({ inning: 1, into: 0, finished: false });
    expect(clockAt(cerrado, 120)).toMatchObject({ inning: 2, into: 0 });
    expect(clockAt(cerrado, totalSeconds(cerrado) - 0.5)).toMatchObject({ inning: 9, finished: false });
    expect(clockAt(cerrado, totalSeconds(cerrado))).toMatchObject({ inning: 9, finished: true });
  });

  it("es determinista: el mismo segundo da siempre el mismo frame", () => {
    for (const script of Object.values(scripts)) {
      for (const second of [0, 37, 260, 745, 900, 1050]) {
        const a = frameAt(script, second);
        const b = frameAt(script, second);
        expect(a).toEqual(b);
      }
    }
  });

  it("no depende de Math.random en ningun punto del guion", () => {
    for (const script of Object.values(scripts)) {
      const first = frameAt(script, 640);
      const second = frameAt(script, 640);
      expect(first.score).toEqual(second.score);
      expect(first.event?.text).toBe(second.event?.text);
    }
  });

  it("el marcador solo sube y nunca se repite el resultado oficial", () => {
    for (const script of Object.values(scripts)) {
      let home = 0;
      let away = 0;
      for (const event of script.timeline) {
        expect(event.home).toBeGreaterThanOrEqual(home);
        expect(event.away).toBeGreaterThanOrEqual(away);
        home = event.home;
        away = event.away;
      }
      const last = script.timeline[script.timeline.length - 1];
      expect(last.home).toBe(script.finalHome);
      expect(last.away).toBe(script.finalAway);
      expect(script.finalHome).not.toBe(script.finalAway);
    }
  });

  it("reinicia outs y bases en cada media entrada", () => {
    for (const script of Object.values(scripts)) {
      for (const event of script.timeline) {
        if (event.at !== 0) continue;
        expect(event.outs).toBe(0);
        expect(event.bases).toBe(0);
      }
    }
  });
});

describe("salto directo a un inning", () => {
  it("entra al 7.o con el marcador y el contexto correctos", () => {
    const state = stateAtInning(cerrado, 7);
    const opening = cerrado.inningStarts.find((item) => item.inning === 7);
    expect(opening).toBeDefined();
    expect(state.score.away).toBe(opening!.away);
    expect(state.score.home).toBe(opening!.home);
    expect(state.start).toBe(6 * 120);

    const frame = frameAt(cerrado, seekToInning(cerrado, 7));
    expect(frame.clock.inning).toBe(7);
    expect(frame.score).toEqual({ away: opening!.away, home: opening!.home });
    expect(frame.inning?.title).toBeTruthy();
  });

  it("NO reproduce los innings anteriores al saltar", () => {
    const atSeven = frameAt(cerrado, seekToInning(cerrado, 7));
    expect(atSeven.event?.inning).toBe(7);
    const earlier = cerrado.timeline.filter((event) => event.inning < 7);
    expect(earlier.length).toBeGreaterThan(40);
    expect(atSeven.event?.text).not.toBe(earlier[earlier.length - 1].text);
  });

  it("cada inning tiene su propia secuencia de eventos", () => {
    for (const script of Object.values(scripts)) {
      const signatures = new Set<string>();
      for (let inning = 1; inning <= 9; inning += 1) {
        const events = script.timeline.filter((event) => event.inning === inning);
        expect(events.length).toBeGreaterThan(4);
        signatures.add(events.map((event) => event.kind).join("|"));
      }
      expect(signatures.size).toBe(9);
    }
  });

  it("el 9.o se siente distinto al resto", () => {
    for (const script of Object.values(scripts)) {
      const final = script.timeline.filter((event) => event.inning === 9);
      // El 9.o siempre tiene su propio pico de tension.
      expect(final.some((event) => event.reaction === "climax")).toBe(true);
      // Y su cierre es el momento mas intenso de toda la experiencia.
      const closing = final[final.length - 1];
      expect(closing.at).toBeGreaterThanOrEqual(100);
      expect(final.filter((event) => event.reaction === "climax").length).toBeGreaterThanOrEqual(1);

      const moment = script.moments.find((item) => item.inning === 9);
      expect(moment).toBeDefined();
      expect(moment!.headline).toBe("ULTIMO INNING");
    }
  });

  it("el 7.o tiene un Momento Pulse con recompensa", () => {
    for (const script of Object.values(scripts)) {
      const moment = script.moments.find((item) => item.inning === 7);
      expect(moment).toBeDefined();
      expect(moment!.headline).toBe("MOMENTO PULSE");
      expect(moment!.bonus).toBeGreaterThan(0);
      expect(moment!.window).toBeGreaterThan(20);
    }
  });
});

describe("Momentos Pulse", () => {
  it("cada momento tiene contexto leido del guion, no generico", () => {
    for (const script of Object.values(scripts)) {
      for (const moment of script.moments) {
        expect(moment.state.length).toBeGreaterThan(6);
        expect(moment.score).toMatch(/^\d+ - \d+$/);
        expect(moment.prompt.length).toBeGreaterThan(8);
        expect(moment.options.length).toBeGreaterThanOrEqual(2);
        expect(moment.options.some((option) => option.id === moment.correct)).toBe(true);
      }
    }
  });

  it("la respuesta correcta coincide con lo que pasa en el guion", () => {
    for (const script of Object.values(scripts)) {
      for (const moment of script.moments) {
        // El guion situa la alta en 0..50 y la baja en 52..118, asi que el
        // cierre de la media entrada es su ultimo evento.
        const halfEvents = script.timeline
          .filter((event) => event.inning === moment.inning && event.half === moment.half)
          .sort((a, b) => a.at - b.at);
        const anchor = halfEvents.filter((event) => event.at <= moment.at).pop()!;
        const closing = halfEvents[halfEvents.length - 1];
        const runs = closing.home + closing.away - (anchor.home + anchor.away);

        if (moment.kind === "scored") {
          expect(moment.correct).toBe(runs > 0 ? "si" : "no");
        }
        if (moment.kind === "halfEnds") {
          const bucket = runs <= 0 ? "no_carrera" : runs === 1 ? "una" : runs === 2 ? "doble" : "triple";
          expect(moment.correct).toBe(bucket);
        }
        if (moment.kind === "inningRuns") {
          const bucket = runs <= 0 ? "0" : runs === 1 ? "1" : runs === 2 ? "2" : "3";
          expect(moment.correct).toBe(bucket);
        }
        if (moment.kind === "winner") {
          if (script.finalHome > script.finalAway) {
            expect(["caracas", "home"]).toContain(moment.correct);
          }
          if (script.finalAway > script.finalHome) {
            expect(["magallanes", "away"]).toContain(moment.correct);
          }
        }
      }
    }
  });

  it("se abre dentro de su ventana y se resuelve despues", () => {
    for (const script of Object.values(scripts)) {
      for (const moment of script.moments) {
        const start = (moment.inning - 1) * script.secondsPerInning;
        expect(moment.resolveAt).toBeGreaterThan(moment.at);
        expect(moment.window).toBeGreaterThan(10);
        // El momento cierra al cumplirse lo que ocurra antes: ventana o resolucion.
        const closesAt = Math.min(moment.at + moment.window, moment.resolveAt);
        expect(closesAt).toBeGreaterThan(moment.at);

        const open = frameAt(script, start + moment.at + 1, {}, {});
        expect(open.moment?.moment.id).toBe(moment.id);

        // Cerrado, este momento ya no se ofrece.
        const after = frameAt(script, start + closesAt, {}, {});
        expect(after.moment?.moment.id).not.toBe(moment.id);
      }
    }
  });

  it("no solapa dos Momentos en el mismo instante", () => {
    for (const script of Object.values(scripts)) {
      for (let inning = 1; inning <= 9; inning += 1) {
        const inInning = script.moments
          .filter((moment) => moment.inning === inning && moment.half === "alta")
          .sort((a, b) => a.at - b.at);
        for (let index = 0; index + 1 < inInning.length; index += 1) {
          const current = inInning[index];
          const next = inInning[index + 1];
          const closes = Math.min(current.at + current.window, current.resolveAt);
          expect(next.at).toBeGreaterThanOrEqual(closes);
        }
      }
    }
  });

  it("respeta elismiss del jugador sin perder el acierto", () => {
    const moment = cerrado.moments[0];
    const start = (moment.inning - 1) * cerrado.secondsPerInning;
    const hidden = frameAt(cerrado, start + moment.at + 1, {}, { [moment.id]: true });
    expect(hidden.moment).toBeNull();

    const answered = frameAt(cerrado, start + moment.at + 1, { [moment.id]: moment.correct }, {});
    expect(answered.moment?.answer).toBe(moment.correct);
  });

  it("ofrece niveles de participacion variados", () => {
    const levels = new Set(cerrado.moments.map((moment) => moment.difficulty));
    expect(levels.size).toBeGreaterThanOrEqual(2);
    for (const script of Object.values(scripts)) {
      const all = new Set(script.moments.map((moment) => moment.difficulty));
      expect(all).toContain("facil");
    }
  });
});

describe("cierre de la experiencia", () => {
  it("resume aciertos sin mezclar el pronostico oficial", () => {
    const all = Object.fromEntries(cerrado.moments.map((moment) => [moment.id, moment.correct]));
    const summary = summarize(cerrado, all);
    expect(summary.correct).toBe(cerrado.moments.length);
    expect(summary.total).toBe(cerrado.moments.length);
    expect(summary.finalHome).toBe(cerrado.finalHome);
    expect(summary.finalAway).toBe(cerrado.finalAway);

    const none = summarize(cerrado, {});
    expect(none.correct).toBe(0);
    expect(none.momentBonus).toBe(0);
  });

  it("el bonus de experiencia depende de los aciertos y de los momentos", () => {
    expect(experienceBonus(0, 0).total).toBe(0);
    expect(experienceBonus(3, 0).total).toBeGreaterThan(0);
    expect(experienceBonus(0, 5).total).toBe(5);
    const full = summarize(
      cerrado,
      Object.fromEntries(cerrado.moments.map((moment) => [moment.id, moment.correct])),
    );
    expect(experienceBonus(full.correct, full.momentBonus).total).toBeGreaterThan(0);
  });

  it("el 9.o termina el partido y el 7.o tiene clímax", () => {
    expect(summarize(ultimo, {}).finalHome).toBe(4);
    expect(summarize(remontada, {}).finalAway).toBe(4);
    const seven = stateAtInning(ultimo, 7);
    expect(seven.score.away).toBe(2);
    expect(seven.score.home).toBe(2);
  });
});

describe("posicionamiento en la linea de tiempo", () => {
  it("ir al momento clave devuelve el segundo exacto", () => {
    for (const script of Object.values(scripts)) {
      for (const moment of script.moments) {
        const second = seekToMoment(script, moment.id);
        expect(second).not.toBeNull();
        const frame = frameAt(script, second!);
        expect(frame.clock.inning).toBe(moment.inning);
      }
    }
  });

  it("el reloj reporta el inning y el margen correctamente", () => {
    const clock = clockAt(cerrado, 7 * 120 + 40);
    expect(clock.inning).toBe(8);
    expect(clock.remainingMs).toBe(80_000);
    expect(clock.progress).toBeCloseTo((7 * 120 + 40) / 1080, 5);
  });

  it("los momentos de la segunda mitad se asocian a la baja", () => {
    const moment = cerrado.moments.find((item) => item.half === "baja" && item.inning >= 4);
    expect(moment).toBeDefined();
    const frame = frameAt(cerrado, (moment!.inning - 1) * 120 + moment!.at + 1);
    expect(frame.clock.half).toBe("baja");
    expect(frame.moment?.moment.id).toBe(moment!.id);
  });

  it("momentStatus recorre el ciclo completo de un momento", () => {
    const moment = cerrado.moments[0];
    const start = (moment.inning - 1) * cerrado.secondsPerInning;
    const before = clockAt(cerrado, start + moment.at - 2);
    const open = clockAt(cerrado, start + moment.at + 2);
    const after = clockAt(cerrado, start + moment.at + moment.window + 3);
    const resolved = clockAt(cerrado, start + moment.resolveAt + 2);

    expect(momentStatus(moment, before, undefined)).toBe("pending");
    expect(momentStatus(moment, open, undefined)).toBe("open");
    expect(momentStatus(moment, open, "si")).toBe("answered");
    // Si la ventana cierra antes de la resolucion, el momento se pierde.
    expect(momentStatus(moment, after, undefined)).toBe(
      after.into >= moment.resolveAt ? "resolved" : "missed",
    );
    expect(momentStatus(moment, resolved, "si")).toBe("resolved");
  });

  it("activeMoment respeta el dismiss y la ventana", () => {
    const moment = ultimo.moments.find((item) => item.inning === 9)!;
    const start = (moment.inning - 1) * ultimo.secondsPerInning;
    const open = activeMoment(ultimo, clockAt(ultimo, start + moment.at + 1), {}, {});
    expect(open?.moment.id).toBe(moment.id);
    expect(activeMoment(ultimo, clockAt(ultimo, start + moment.at + 1), {}, { [moment.id]: true })).toBeNull();
  });
});
