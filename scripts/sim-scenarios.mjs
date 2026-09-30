/**
 * Autoria de los guiones de la experiencia Juégate el Tobo.
 *
 * Este archivo es la fuente de autoria. Para regenerar la migracion:
 *   node scripts/sim-scenarios.mjs [destino.sql]
 *
 * Reglas:
 *  - Nada de aleatoriedad. El mismo guion se produce siempre igual.
 *  - Un escenario = 9 innings, cada uno con su propia secuencia.
 *  - El guion se guarda en la base (pulse_sim_scenarios) y el motor del
 *    cliente solo lo reproduce. El servidor nunca inventa jugadas.
 */

import { writeFileSync } from "node:fs";

export const INNINGS = 9;
export const DEFAULT_INNING_SECONDS = 120;

/** Reacciones visuales: una sola taxonomia para toda la experiencia. */
const REACTION_BY_KIND = {
  inning_start: "calm",
  strike: "calm",
  ball: "calm",
  out: "calm",
  ponche: "calm",
  hit: "cheer",
  doble: "cheer",
  triple: "cheer",
  robo: "tense",
  error: "tense",
  doble_play: "turn",
  carrera: "turn",
  jonron: "climax",
  cambio: "turn",
  pausa: "calm",
  momento: "tense",
};

/** Aplica los flags de un beat sobre el estado acumulado del partido. */
function applyFlags(state, half, flags) {
  let outs = state.outs;
  let basesMask = state.bases;
  let runs = 0;

  for (const token of flags.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (token === "o") {
      outs = Math.min(3, outs + 1);
    } else if (/^b[0-7]$/.test(token)) {
      basesMask = Number(token.slice(1));
    } else if (/^r\d+$/.test(token)) {
      runs += Number(token.slice(1));
    }
  }

  if (outs >= 3) basesMask = 0;
  return {
    outs,
    bases: basesMask,
    runs,
    home: state.home + (half === "baja" ? runs : 0),
    away: state.away + (half === "alta" ? runs : 0),
  };
}

/**
 * Cada inning se parte en dos mitades que ocupan rangos disjuntos.
 * Asi el segundo dentro del inning identifica sin ambigüedad en que media
 * entrada estamos, y un momento nunca puede chocar con una jugada del otro lado.
 *
 *   alta  [0 .. 50]
 *   baja  [52 .. 118]
 */
const ALTA = { first: 0, last: 50 };
const BAJA = { first: 52, last: 118 };

const WINDOW = { alta: ALTA, baja: BAJA };

/**
 * Los offsets que escribe el autor estan en una escala de 0..100 dentro de
 * su media entrada. Aqui se traducen a la ventana real del inning.
 */
function absoluteAt(half, at) {
  const window = WINDOW[half];
  const clamped = Math.min(100, Math.max(0, at));
  return window.first + Math.round((clamped / 100) * (window.last - window.first));
}

/**
 * Convierte el plan autorado en un timeline plano y determinista.
 * Cada beat es [kind, text, flags, at?].
 * Flags: "o" = un out, "rN" = N carreras al lado que batea, "bN" = bases.
 */
export function buildTimeline(plan) {
  const flat = [];
  const state = { home: 0, away: 0, outs: 0, bases: 0 };
  const inningStarts = [];

  for (const inningPlan of plan.innings) {
    inningStarts.push({
      inning: inningPlan.inning,
      home: state.home,
      away: state.away,
      title: inningPlan.title,
      subtitle: inningPlan.subtitle,
    });

    for (const half of inningPlan.halves) {
      // Cada media entrada arranca con 0 outs y bases vacias.
      state.outs = 0;
      state.bases = 0;
      const beats = half.beats;

      beats.forEach((beat, index) => {
        const [kind, rawText, flags = "", explicitAt] = beat;
        const at = absoluteAt(half.half, explicitAt != null ? explicitAt : (index / Math.max(1, beats.length - 1)) * 100);
        const next = applyFlags(state, half.half, flags);
        state.outs = next.outs;
        state.bases = next.bases;
        state.home = next.home;
        state.away = next.away;

        let text = rawText;
        if (next.runs === 1) text = `${text} Entra una carrera.`;
        if (next.runs > 1) text = `${text} Entran ${next.runs} carreras.`;

        flat.push({
          inning: inningPlan.inning,
          half: half.half,
          at,
          kind,
          reaction: REACTION_BY_KIND[kind] ?? "calm",
          text: text.replace(/\s+/g, " ").trim(),
          home: state.home,
          away: state.away,
          outs: state.outs,
          bases: state.bases,
        });
      });
    }
  }

  return { timeline: flat, inningStarts, finalHome: state.home, finalAway: state.away };
}

const BASE_NAMES = {
  0: "bases vacías",
  1: "corredor en primera",
  2: "corredor en segunda",
  3: "corredores en primera y segunda",
  4: "corredor en tercera",
  5: "corredores en primera y tercera",
  6: "corredores en segunda y tercera",
  7: "bases llenas",
};

function describeState(state) {
  const outs = state.outs === 0 ? "sin outs" : state.outs === 1 ? "un out" : `${state.outs} outs`;
  return `${BASE_NAMES[state.bases] ?? "bases vacías"}, ${outs}`;
}

/**
 * Deduce la respuesta correcta a partir del propio guion.
 *
 * Todo se resuelve dentro de la media entrada (inning + half) donde el momento
 * esta escrito, nunca sobre el inning completo. Si el momento no coincide con
 * una jugada real de esa media entrada, el generador falla.
 * Esto hace imposible que una demo responda mal a su propia partida.
 */
function resolveCorrect(timeline, moment, finalScore) {
  const half = moment.half ?? "alta";
  const halfEvents = timeline
    .filter((event) => event.inning === moment.inning && event.half === half)
    .sort((a, b) => a.at - b.at);
  // El momento se ancla a la jugada real que lo dispara. Si el autor no
  // apunto a ninguna, el generador falla: es mejor que quepa exacto.
  const target = absoluteAt(half, moment.at);
  const anchor = halfEvents.find((event) => event.at === target);
  if (!anchor) {
    const nearby = halfEvents.map((event) => `${event.at}:${event.kind}`).join(" ");
    throw new Error(
      `Momento "${moment.id}": en el inning ${moment.inning} (${half}) no hay jugada en el segundo ${target}. Jugadas: ${nearby}`
    );
  }
  let resolveAt = absoluteAt(half, moment.resolveAt);
  if (resolveAt <= anchor.at) {
    throw new Error(`Momento "${moment.id}": resolveAt tiene que ser despues de at.`);
  }
  // La resolucion se ancla igual a una jugada real, para que la respuesta
  // siempre corresponda a algo que efectivamente ocurrio.
  const resolver = halfEvents.find((event) => event.at === resolveAt) ?? halfEvents.find((event) => event.at > anchor.at);
  if (!resolver || resolver.at <= anchor.at) {
    throw new Error(`Momento "${moment.id}": no hay jugadas despues del momento.`);
  }
  resolveAt = resolver.at;

  const before = halfEvents.filter((event) => event.at < anchor.at);
  const after = halfEvents.filter((event) => event.at > resolveAt);
  const state = before.length ? before[before.length - 1] : null;
  const end = after.length ? after[after.length - 1] : state;
  const runsBefore = state ? state.home + state.away : 0;
  const runsAfter = end ? end.home + end.away : runsBefore;
  const runsInHalf = runsAfter - runsBefore;
  const next = halfEvents.find((event) => event.at > anchor.at) ?? null;
  const options = moment.options;
  const pick = (value) => (options.some((option) => option.id === value) ? value : null);

  // El estado que ve el usuario se lee del guion, nunca de un texto escrito a mano.
  const facts = {
    at: anchor.at,
    resolveAt,
    state: describeState(anchor),
    score: `${anchor.away} - ${anchor.home}`,
    half,
    inning: moment.inning,
  };

  const resolved = resolveAnswer(moment.kind, pick, moment.map ?? {}, { runsInHalf, next, finalScore });
  return { resolved, facts };
}

function resolveAnswer(kind, pick, map, { runsInHalf, next, finalScore }) {
  switch (kind) {
    case "scored":
      return pick(runsInHalf > 0 ? "si" : "no");
    case "runs":
    case "inningRuns":
      if (runsInHalf <= 0) return pick("0");
      if (runsInHalf === 1) return pick("1");
      if (runsInHalf === 2) return pick("2");
      return pick("3");
    case "nextPlay": {
      if (!next) return null;
      if (next.kind === "jonron") return pick("jonron");
      if (next.kind === "doble_play") return pick("dp");
      if (["hit", "doble", "triple", "error", "robo", "carrera"].includes(next.kind)) return pick("hit");
      return pick("ponche");
    }
    case "halfEnds": {
      if (runsInHalf <= 0) return pick("no_carrera");
      if (runsInHalf === 1) return pick("una");
      if (runsInHalf === 2) return pick("doble");
      return pick("triple");
    }
    case "winner": {
      if (finalScore.home === finalScore.away) return pick(map.tie ?? null);
      return finalScore.home > finalScore.away ? pick(map.home ?? null) : pick(map.away ?? null);
    }
    default:
      return null;
  }
}
export function buildScenario(scenario) {
  const { timeline, inningStarts, finalHome, finalAway } = buildTimeline(scenario);
  const finalScore = { home: finalHome, away: finalAway };
  const moments = scenario.moments.map((moment) => {
    const { resolved, facts } = resolveCorrect(timeline, moment, finalScore);
    if (!resolved) {
      throw new Error(`Escenario "${scenario.id}" momento "${moment.id}": el tipo "${moment.kind}" no se pudo resolver desde el guion.`);
    }
    return {
      id: moment.id,
      inning: moment.inning,
      half: moment.half ?? "alta",
      at: facts.at,
      kind: moment.kind,
      title: moment.title,
      headline: moment.headline ?? "MOMENTO PULSE",
      lead: moment.lead,
      state: facts.state,
      score: facts.score,
      prompt: moment.prompt,
      options: moment.options,
      correct: resolved,
      difficulty: moment.difficulty,
      window: moment.window ?? 38,
      resolveAt: facts.resolveAt,
      bonus: moment.bonus ?? 0,
    };
  });

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    tension: scenario.tension,
    innings: INNINGS,
    secondsPerInning: scenario.secondsPerInning ?? DEFAULT_INNING_SECONDS,
    finalHome,
    finalAway,
    inningStarts,
    timeline,
    moments,
  };
}

// --- Helpful beat constructors -------------------------------------------

const T = {
  start: (text, at) => ["inning_start", text, "", at],
  out: (text = "Out al campo.", flags = "o", at) => ["out", text, flags, at],
  strike: (text, flags = "", at) => ["strike", text, flags, at],
  ball: (text, flags = "", at) => ["ball", text, flags, at],
  ponche: (text = "Ponche. Se va.", flags = "o", at) => ["ponche", text, flags, at],
  hit: (text, flags, at) => ["hit", text, flags, at],
  doble: (text, flags, at) => ["doble", text, flags, at],
  triple: (text, flags, at) => ["triple", text, flags, at],
  jonron: (text, flags, at) => ["jonron", text, flags, at],
  robo: (text, flags, at) => ["robo", text, flags, at],
  error: (text, flags, at) => ["error", text, flags, at],
  dp: (text, flags, at) => ["doble_play", text, flags, at],
  carrera: (text, flags, at) => ["carrera", text, flags, at],
  cambio: (text, flags, at) => ["cambio", text, flags, at],
  pausa: (text, flags = "", at) => ["pausa", text, flags, at],
};

const M = { easy: "facil", medium: "medio", fan: "fan" };
const ON1 = "b1";
const ON2 = "b2";
const ON3 = "b4";
const ON12 = "b3";
const ON13 = "b5";
const ON23 = "b6";
const LOADED = "b7";

// ---------------------------------------------------------------------------
// ESCENARIO 1 - Partido cerrado
// Caracas toma la ventaja y administra. El 7.o es el momento comercial.
// Final: Caracas 8 - Magallanes 7
// ---------------------------------------------------------------------------
const cerrado = {
  id: "cerrado",
  name: "Partido cerrado",
  description:
    "Magallanes abre arriba y Caracas lo empata. El partido se aprieta hasta que el 7.o se vuelve el momento donde todos en la tasca participan.",
  tension: "controlado",
  secondsPerInning: DEFAULT_INNING_SECONDS,
  innings: [
    {
      inning: 1,
      title: "Arranca el partido",
      subtitle: "Los primeros outs deciden el ritmo",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("Arranca el partido. Magallanes abre bateando."),
            T.hit("Sencillo de Magallanes por el centro.", ON1),
            T.out("Out en primera."),
            T.jonron("Jonron de Magallanes al jardinero. Se van dos.", "r2,b0"),
            T.start("Cierra la primera mitad. Magallanes suma dos."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Turno de Caracas. Resignan la ventaja."),
            T.ponche("Ponche de apertura. Caracas empieza abajo."),
            T.hit("Sencillo de Caracas por la banda izquierda.", ON1),
            T.ball("Base por bolas. Se acerca el corredor del empate.", ON12),
            T.carrera("Sencillo y entra la carrera. Caracas se acerca.", "r1,b0"),
            T.start("Se cierra el 1.o inning. Magallanes 2 - Caracas 1."),
          ],
        },
      ],
    },
    {
      inning: 2,
      title: "Se define arriba",
      subtitle: "Magallanes toma la ventaja",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("2.o inning. Magallanes vuelve al bateo."),
            T.ponche("Ponche. Fuera."),
            T.doble("Doble de Magallanes por la esquina.", ON2),
            T.strike("Strike. Faltan dos outs."),
            T.carrera("Hit y anotan dos. Magallanes se va con tres.", "r2,b0"),
            T.start("Magallanes se va con tres de ventaja."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas responde en el 2.o."),
            T.ponche("Ponche rapido. Primer out."),
            T.error("Error defensivo. La pelota se escapa y abre las bases.", ON12),
            T.ponche("Ponche. Dos outs."),
            T.carrera("Hit que acorta la distancia. 4-2 en el 2.o.", "r1,b0"),
            T.start("Segundo inning cerrado. Magallanes 4 - Caracas 2."),
          ],
        },
      ],
    },
    {
      inning: 3,
      title: "Turno defensivo",
      subtitle: "Aparecen las jugadas grandes",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("3.o inning. Magallanes al bateo."),
            T.hit("Sencillo de Magallanes.", ON1),
            T.ponche("Ponche. Dos outs."),
            T.hit("Hit al centro. Bases llenas.", LOADED),
            T.carrera("Carrera de Magallanes. Amplia la ventaja.", "r1,b0"),
            T.start("Magallanes abre dos carreras."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. Buscan responder."),
            T.ponche("Ponche. Fuera."),
            T.doble("Doble de Caracas por la linea.", ON2),
            T.ponche("Ponche. Dos outs."),
            T.robo("Robo de tercera. El corredor se acerca a anotar.", ON23),
            T.ponche("Ponche. Se va el inning sin carreras."),
            T.start("3.o inning termina. Magallanes 5 - Caracas 2."),
          ],
        },
      ],
    },
    {
      inning: 4,
      title: "Oportunidad de carrera",
      subtitle: "Un inning que se define",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("4.o inning. Todavia sin carreras."),
            T.out("Fly out al centro."),
            T.out("Out en tercera."),
            T.pausa("Magallanes no registra nada en el inning."),
            T.start("Cero. El marcador sigue igual."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas tiene su oportunidad. Bases vacias."),
            T.hit("Hit de Caracas por la esquina izquierda.", ON1),
            T.hit("Sencillo. Runners en primera y segunda.", ON12),
            T.out("Out en segunda. Un out."),
            T.hit("Hit al centro. La carrera se acerca.", "r1,b0"),
            T.start("4.o inning. Magallanes 5 - Caracas 3."),
          ],
        },
      ],
    },
    {
      inning: 5,
      title: "Cambio de ritmo",
      subtitle: "La defensa se afirma",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("5.o inning. El tempo baja."),
            T.ponche("Ponche. Un out."),
            T.dp("Doble play. Se acaba el medio turno.", "o"),
            T.start("Dos outs en una jugada. Magallanes se queda sin corredor."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo en el 5.o."),
            T.hit("Sencillo de Caracas.", ON1),
            T.out("Out al jardinero central."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Se queda en primera. El inning cierra sin carreras."),
            T.start("5.o inning sin anotacion. Sigue 5-3."),
          ],
        },
      ],
    },
    {
      inning: 6,
      title: "Juego importante",
      subtitle: "El partido cambia de dueno",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("6.o inning. Magallanes abre el inning grande."),
            T.jonron("Jonron de Magallanes. Una carrera de ventaja.", "r1,b0"),
            T.hit("Sencillo. Un out.", ON1),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes se queda con una. El margen no crece."),
            T.start("Magallanes suma una y se aleja a dos."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas necesita responder en el 6.o."),
            T.doble("Doble de Caracas al jardinero izquierdo.", ON2),
            T.hit("Sencillo. Runners en segunda y tercera.", ON23),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.carrera("Hit de Caracas. Anota una. A dos del final.", "r1,b0"),
            T.start("6.o inning cierra. Magallanes 6 - Caracas 4."),
          ],
        },
      ],
    },
    {
      inning: 7,
      title: "Momento Pulse",
      subtitle: "El partido se cierra y toca jugar",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("7.o inning. Aqui se decide si la tasca se enciende.", 0),
            T.ponche("Ponche de apertura. Un out.", "o", 6),
            T.hit("Sencillo de Magallanes. Runners en primera y segunda.", ON12, 14),
            T.pausa("Primero y segundo, un out. Todo el mundo mira.", "", 22),
            T.pausa("MOMENTO PULSE. Se le pregunta a la tasca.", "m1", 30),
            T.carrera("Hit de Magallanes y anotan dos. El margen se abre.", "r2,b0", 74),
            T.start("La ventaja se define en el momento clave.", 82),
            T.pausa("El inning mas importante del juego termina.", "", 104),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas necesita dos carreras. Vienen abajo."),
            T.hit("Sencillo por la banda.", ON1),
            T.ponche("Ponche. Un out."),
            T.hit("Hit. Runners en primera y segunda.", ON12),
            T.carrera("Hit de Caracas. Anota una. A tres del final.", "r1,b0"),
            T.pausa("Se queda a tres. El partido sigue vivo."),
            T.start("7.o inning cierra. Magallanes 8 - Caracas 5."),
          ],
        },
      ],
    },
    {
      inning: 8,
      title: "La tension sube",
      subtitle: "Un inning de margen minimo",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("8.o inning. Un error aqui no se perdona."),
            T.out("Out en primera."),
            T.out("Out en el right."),
            T.hit("Sencillo con un out.", ON1),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes no amplia. El margen sigue."),
            T.start("El margen sigue siendo de dos."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas contra el reloj."),
            T.doble("Doble por el right.", ON2),
            T.out("Out en segunda."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Caracas no anota. Se queda a tres carreras."),
            T.start("8.o inning. Magallanes 8 - Caracas 5."),
          ],
        },
      ],
    },
    {
      inning: 9,
      title: "Ultimo inning",
      subtitle: "Todo se decide aqui",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("9.o inning. Magallanes necesita una carrera.", 0),
            T.hit("Sencillo. Un out.", ON1, 8),
            T.ponche("Ponche. Dos outs.", "o", 20),
            T.pausa("Tercer bateo. Magallanes necesita una carrera.", "", 30),
            T.pausa("MOMENTO FINAL. La pregunta que decide.", "m3", 40),
            T.pausa("Un out. La carrera se sigue eliminando.", "o", 64),
            T.pausa("Caracas sabe que tiene que anotar dos.", "", 72),
            T.pausa("Tercer out. Magallanes se va sin carreras.", "", 100),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. Dos outs. Necesitan dos.", 0),
            T.hit("Sencillo. Un out.", ON1, 8),
            T.hit("Hit. Runners en primera y segunda, un out.", ON12, 18),
            T.ponche("Ponche. Dos outs.", "o", 30),
            T.pausa("Corredores en primera y segunda. Magallanes al monticulo.", "", 40),
            T.pausa("MOMENTO PULSE. La ultima decision.", "m4", 52),
            T.hit("Hit de Caracas. Runners en segunda y tercera, dos outs.", ON23, 70),
            T.pausa("Nadie out. El estadio entero esta de pie.", "", 80),
            T.pausa("Ultima jugada. Todo el local esperando.", "", 90),
            T.hit("Hit de Caracas. Bases llenas, dos outs.", LOADED, 96),
            T.jonron("JONRON DE CARACAS. Anotan cuatro y ganan.", "r4,b0", 104),
            T.pausa("Walk-off. Caracas 9 - Magallanes 8. Fin del partido.", "", 114),
          ],
        },
      ],
    },
  ],
  moments: [
    {
      id: "cerrado-m1",
      inning: 7,
      at: 30,
      half: "alta",
      kind: "halfEnds",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "El partido esta cerrado y aqui se decide.",
      prompt: "Como termina esta entrada?",
      options: [
        { id: "no_carrera", label: "Sin carreras" },
        { id: "una", label: "Una carrera" },
        { id: "doble", label: "Dos carreras" },
        { id: "triple", label: "Tres o mas" },
      ],
      difficulty: M.fan,
      window: 34,
      resolveAt: 70,
      bonus: 5,
    },
    {
      id: "cerrado-m2",
      inning: 4,
      at: 39,
      half: "baja",
      kind: "scored",
      title: "Observacion",
      headline: "MOMENTO PULSE",
      lead: "El 4.o inning se define en esta entrada.",
      prompt: "Anota Caracas en este inning?",
      options: [
        { id: "si", label: "Si" },
        { id: "no", label: "No" },
      ],
      difficulty: M.easy,
      window: 34,
      resolveAt: 90,
    },
    {
      id: "cerrado-m3",
      inning: 9,
      at: 40,
      half: "alta",
      kind: "scored",
      title: "Momento final",
      headline: "ULTIMO INNING",
      lead: "Magallanes necesita una carrera para asegurar el juego.",
      prompt: "Marca Magallanes en el 9.o?",
      options: [
        { id: "si", label: "Marca al menos una" },
        { id: "no", label: "Se queda en cero" },
      ],
      difficulty: M.medium,
      window: 30,
      resolveAt: 66,
      bonus: 5,
    },
    {
      id: "cerrado-m4",
      inning: 9,
      at: 52,
      half: "baja",
      kind: "nextPlay",
      title: "Ultima jugada",
      headline: "MOMENTO FINAL",
      lead: "Caracas necesita dos carreras. Magallanes esta en el monticulo.",
      prompt: "Que ocurre en la proxima jugada?",
      options: [
        { id: "ponche", label: "Ponche" },
        { id: "hit", label: "Hit" },
        { id: "dp", label: "Doble play" },
        { id: "jonron", label: "Jonron" },
      ],
      difficulty: M.medium,
      window: 18,
      resolveAt: 70,
      bonus: 5,
    },
    {
      id: "cerrado-m5",
      inning: 2,
      at: 39,
      half: "baja",
      kind: "scored",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "Caracas va abajo y todavia no se haemperrado.",
      prompt: "Anota Caracas en este inning?",
      options: [
        { id: "si", label: "Si" },
        { id: "no", label: "No" },
      ],
      difficulty: M.fan,
      window: 34,
      resolveAt: 90,
    },
    {
      id: "cerrado-m6",
      inning: 6,
      at: 50,
      half: "baja",
      kind: "inningRuns",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "Caracas necesita reaccionar en el 6.o.",
      prompt: "Cuantas carreras anota Caracas en este inning?",
      options: [
        { id: "0", label: "0" },
        { id: "1", label: "1" },
        { id: "2", label: "2 o mas" },
      ],
      difficulty: M.medium,
      window: 30,
      resolveAt: 94,
    },
  ],
};

// ---------------------------------------------------------------------------
// ESCENARIO 2 - Remontada
// Caracas va tres abajo y lo voltea en el 6.o.
// Final: Caracas 8 - Magallanes 4
// ---------------------------------------------------------------------------
const remontada = {
  id: "remontada",
  name: "Remontada",
  description:
    "Caracas va tres abajo, se acerca de golpe en el 3.o y lo voltea en el 6.o. El momento donde la tasca enciende el telefono.",
  tension: "escala",
  secondsPerInning: DEFAULT_INNING_SECONDS,
  innings: [
    {
      inning: 1,
      title: "Arranca el partido",
      subtitle: "Magallanes golpea primero",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("Arranca el partido. Magallanes abre bateando."),
            T.doble("Doble de Magallanes por la linea.", ON2),
            T.ponche("Ponche. Un out."),
            T.carrera("Hit de Magallanes. Anota la primera del juego.", "r1,b0"),
            T.pausa("Magallanes anota la primera del partido."),
            T.start("Cierra la primera mitad. Magallanes 1 - Caracas 0."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas responde."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Caracas se queda sin corredor."),
            T.start("1.o inning cierra. Magallanes 1 - Caracas 0."),
          ],
        },
      ],
    },
    {
      inning: 2,
      title: "Se abre la brecha",
      subtitle: "Magallanes sigue anotando",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("2.o inning. Magallanes al bateo."),
            T.hit("Sencillo. Runners en primera y segunda.", ON12),
            T.carrera("Hit de Magallanes. Anotan dos. El margen se abre.", "r2,b0"),
            T.hit("Sencillo de Magallanes.", ON1),
            T.pausa("Se quedan a una carrera del tercero."),
            T.start("3-0. El partido se pone cuesta arriba."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas necesita empezar a subir."),
            T.hit("Sencillo de Caracas.", ON1),
            T.out("Out en segunda."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Se queda en primera. El inning no mueve el marcador."),
            T.start("2.o inning sin carreras de Caracas."),
          ],
        },
      ],
    },
    {
      inning: 3,
      title: "Vuelve el partido",
      subtitle: "Caracas responde de golpe",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("3.o inning. Magallanes abre el inning."),
            T.out("Fly out al jardinero izquierdo."),
            T.out("Ground out en primera."),
            T.pausa("Seis outs y sin carreras. La defensa de Caracas responde."),
            T.start("Buen defensa. Sigue 3-0."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. Nadie out todavia."),
            T.doble("Doble de Caracas al right.", ON2),
            T.hit("Hit de Caracas. Runners en segunda y tercera.", ON23),
            T.out("Out al jardinero izquierdo."),
            T.carrera("Sencillo y anotan dos. Se acerca el partido.", "r2,b0"),
            T.start("Vuelve el partido. 3-2."),
          ],
        },
      ],
    },
    {
      inning: 4,
      title: "Se empata",
      subtitle: "La remontada arranca en serio",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("4.o inning. Magallanes intenta responder."),
            T.hit("Sencillo. Un out.", ON1),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes se queda en primera."),
            T.start("Magallanes anota una. Sigue la diferencia de una."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas busca el empate."),
            T.hit("Hit de Caracas. Un out.", ON1),
            T.hit("Sencillo. Runners en primera y segunda.", ON12),
            T.ponche("Ponche. Dos outs."),
            T.carrera("Hit de Caracas. Empatado.", "r1,b0"),
            T.start("4.o inning. 4-3. El partido esta vivo."),
          ],
        },
      ],
    },
    {
      inning: 5,
      title: "Punto de inflexion",
      subtitle: "Media velocidad",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("5.o inning. Magallanes al bateo."),
            T.out("Out en primera."),
            T.hit("Sencillo. Un out.", ON1),
            T.out("Out en tercera. Dos outs."),
            T.ponche("Ponche. Tres outs."),
            T.start("Magallanes se retira sin anotar."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. Nadie out todavia."),
            T.ponche("Ponche. Un out."),
            T.hit("Sencillo. Dos outs.", ON1),
            T.pausa("Se queda en primera. Nadie mas."),
            T.start("5.o inning. Caracas 4 - Magallanes 3."),
          ],
        },
      ],
    },
    {
      inning: 6,
      title: "Se acerca",
      subtitle: "Un inning de cuatro carreras",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("6.o inning. Magallanes abre el inning."),
            T.out("Fly out al centro."),
            T.out("Out en segunda."),
            T.pausa("Magallanes se retira sin carreras. Un inning corto."),
            T.start("El inning de Caracas esta por llegar."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo en el 6.o. Esto es lo que esperaban."),
            T.triple("Triple de Caracas al centro. Anota una.", "r1,b4"),
            T.hit("Sencillo. Runners en tercera y primera.", ON13),
            T.hit("Hit de Caracas. Runners en todas.", LOADED),
            T.pausa("Bases llenas. Todo el parketo se levanta.", "", 82),
            T.carrera("Rally de Caracas. Anotan dos mas. Toman la ventaja.", "r2,b0", 96),
            T.pausa("La remontada es un hecho. 6-3.", "", 108),
            T.start("6.o inning: tres carreras. El partido cambio de dueno.", 118),
          ],
        },
      ],
    },
    {
      inning: 7,
      title: "Momento Pulse",
      subtitle: "La remontada se consolida",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("7.o inning. Caracas lidera. Aqui se enciende la tasca.", 0),
            T.ponche("Ponche. Un out.", "o", 8),
            T.hit("Sencillo de Magallanes. Runners en primera y segunda.", ON12, 18),
            T.pausa("Magallanes amenaza. Un out.", "", 30),
            T.pausa("MOMENTO PULSE. La pregunta que se ve desde la barra.", "m1", 38),
            T.carrera("Hit de Magallanes. Anota una. Se acerca.", "r1,b0", 74),
            T.pausa("Una carrera. Magallanes acorta la distancia.", "", 84),
            T.pausa("Caracas responde abajo.", "", 100),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas anota para asegurar la remontada."),
            T.hit("Sencillo. Un out.", ON1),
            T.hit("Hit. Runners en primera y segunda.", ON12),
            T.ponche("Ponche. Dos outs."),
            T.carrera("Hit de Caracas. Anota una. Amplia el margen.", "r1,b0"),
            T.pausa("Magallanes se queda a cuatro."),
            T.start("7.o inning cierra. Caracas 8 - Magallanes 4."),
          ],
        },
      ],
    },
    {
      inning: 8,
      title: "Un inning frio",
      subtitle: "Nadie anota",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("8.o inning. Magallanes al bateo."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes se va sin carreras. El margen sigue."),
            T.start("Cero para Magallanes."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas quiere asegurar la remontada."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Ni una carrera. El margen se mantiene."),
            T.start("8.o inning sin anotacion."),
          ],
        },
      ],
    },
    {
      inning: 9,
      title: "Ultimo inning",
      subtitle: "La remontada se cierra aqui",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("9.o inning. Magallanes necesita cuatro. No alcanza.", 0),
            T.hit("Sencillo. Un out.", ON1, 10),
            T.ponche("Ponche. Dos outs.", "o", 24),
            T.pausa("Magallanes sabe que no alcanza.", "", 34),
            T.pausa("MOMENTO FINAL. La ultima pregunta.", "m3", 44),
            T.pausa("Se cierra el 9.o arriba sin carreras.", "", 76),
            T.pausa("Caracas sale a cerrar el partido abajo.", "", 96),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo por la ultima vez.", 0),
            T.ponche("Ponche. Un out.", "o", 12),
            T.pausa("Magallanes tiene el monticulo fresco.", "", 24),
            T.hit("Sencillo de Caracas. Dos outs.", ON1, 38),
            T.pausa("Nadie out. El estadio se pone de pie.", "", 50),
            T.jonron("JONRON DE CARACAS. Anota dos y cierra el partido.", "r2,b0", 78),
            T.pausa("Caracas 9 - Magallanes 5. Fin de la remontada.", "", 92),
            T.pausa("La tasca celebra el ultimo inning.", "", 100),
          ],
        },
      ],
    },
  ],
  moments: [
    {
      id: "remontada-m1",
      inning: 7,
      at: 38,
      half: "alta",
      kind: "halfEnds",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "Caracas lidera y Magallanes quiere acortar la distancia.",
      prompt: "Como termina esta entrada de Magallanes?",
      options: [
        { id: "no_carrera", label: "Sin carreras" },
        { id: "una", label: "Una carrera" },
        { id: "doble", label: "Dos carreras" },
        { id: "triple", label: "Tres o mas" },
      ],
      difficulty: M.medium,
      window: 32,
      resolveAt: 70,
      bonus: 5,
    },
    {
      id: "remontada-m2",
      inning: 3,
      at: 39,
      half: "baja",
      kind: "scored",
      title: "Observacion",
      headline: "MOMENTO PULSE",
      lead: "El partido se les esta yendo a Caracas. Todavia no se rindieron.",
      prompt: "Anota Caracas en este inning?",
      options: [
        { id: "si", label: "Si" },
        { id: "no", label: "No" },
      ],
      difficulty: M.fan,
      window: 34,
      resolveAt: 90,
      bonus: 5,
    },
    {
      id: "remontada-m3",
      inning: 9,
      at: 44,
      half: "alta",
      kind: "scored",
      title: "Momento final",
      headline: "ULTIMO INNING",
      lead: "Magallanes necesita una remontada que no alcanza.",
      prompt: "Marca Magallanes en el 9.o?",
      options: [
        { id: "si", label: "Marca al menos una" },
        { id: "no", label: "Se queda en cero" },
      ],
      difficulty: M.easy,
      window: 28,
      resolveAt: 74,
    },
    {
      id: "remontada-m4",
      inning: 6,
      at: 14,
      half: "baja",
      kind: "scored",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "Caracas arranca el rally que cambia el partido.",
      prompt: "Anota Caracas en esta entrada?",
      options: [
        { id: "si", label: "Si" },
        { id: "no", label: "No" },
      ],
      difficulty: M.medium,
      window: 44,
      resolveAt: 96,
      bonus: 5,
    },
    {
      id: "remontada-m5",
      inning: 4,
      at: 61,
      half: "baja",
      kind: "winner",
      title: "Observacion",
      headline: "MOMENTO PULSE",
      lead: "Aun quedan cinco innings. Todo puede pasar.",
      prompt: "Quien gana este partido?",
      options: [
        { id: "caracas", label: "Caracas" },
        { id: "magallanes", label: "Magallanes" },
      ],
      map: { home: "caracas", away: "magallanes" },
      difficulty: M.fan,
      window: 40,
      resolveAt: 112,
    },
  ],
};

// ---------------------------------------------------------------------------
// ESCENARIO 3 - Ultimo inning dramatico
// Partido parejo. El 9.o se decide con una carreraBelow.
// Final: Caracas 4 - Magallanes 3
// ---------------------------------------------------------------------------
const ultimo = {
  id: "ultimo",
  name: "Ultimo inning dramatico",
  description:
    "Partido parejo hasta el final. El 9.o empieza abajo por una y Caracas lo da vuelta con un hit. El momento para mostrarle a un tasca que pasa cuando todos participan.",
  tension: "climax",
  secondsPerInning: DEFAULT_INNING_SECONDS,
  innings: [
    {
      inning: 1,
      title: "Arranca el partido",
      subtitle: "Defensa y primeros hits",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("Arranca el partido. Magallanes al bateo."),
            T.ponche("Ponche. Un out."),
            T.hit("Sencillo de Magallanes.", ON1),
            T.pausa("Se queda en primera. El pitcher se afirma."),
            T.start("1.o inning alto sin carreras."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas responde."),
            T.hit("Sencillo de Caracas. Un out.", ON1),
            T.out("Out en tercera."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Se queda en primera. Nadie anota."),
            T.start("1.o inning cierra 0-0."),
          ],
        },
      ],
    },
    {
      inning: 2,
      title: "Primeras carreras",
      subtitle: "Se abre el marcador",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("2.o inning. Magallanes al bateo."),
            T.hit("Hit de Magallanes. Un out.", ON1),
            T.hit("Sencillo. Runners en primera y segunda.", ON12),
            T.out("Out al jardinero izquierdo."),
            T.carrera("Hit de Magallanes. Abre el marcador.", "r1,b0"),
            T.start("Magallanes 1 - Caracas 0."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas iguala."),
            T.hit("Sencillo de Caracas.", ON1),
            T.ponche("Ponche. Un out."),
            T.hit("Hit de Caracas. Runners en primera y segunda.", ON12),
            T.out("Out en segunda."),
            T.carrera("Hit de Caracas. Empatado.", "r1,b0"),
            T.start("1-1. Partido parejo."),
          ],
        },
      ],
    },
    {
      inning: 3,
      title: "Partido de pitcher",
      subtitle: "Nadie anota",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("3.o inning. Nadie ha anotado todavia."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes se retira. Sigue 1-1."),
            T.start("Dos outs rapidos. El pitcher trabaja."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas contra el mismo lanzador."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Caracas tampoco anota. Sigue 1-1."),
            T.start("3.o inning sin anotacion para nadie."),
          ],
        },
      ],
    },
    {
      inning: 4,
      title: "Se rompe el empate",
      subtitle: "Caracas se adelanta",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("4.o inning. Magallanes al bateo."),
            T.out("Fly out al centro."),
            T.hit("Sencillo. Un out.", ON1),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes no anota."),
            T.start("Magallanes se va en blanco."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo con la presion del partido."),
            T.doble("Doble de Caracas al jardinero izquierdo.", ON2),
            T.hit("Hit de Caracas. Runners en segunda y tercera.", ON23),
            T.carrera("Sencillo. Anota Caracas. Abre el marcador.", "r1,b0"),
            T.pausa("Caracas se adelanta en el 4.o."),
            T.start("4.o inning. Caracas 2 - Magallanes 1."),
          ],
        },
      ],
    },
    {
      inning: 5,
      title: "Se empata",
      subtitle: "Media inning",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("5.o inning. Magallanes responde."),
            T.hit("Sencillo. Un out.", ON1),
            T.hit("Hit. Runners en primera y segunda.", ON12),
            T.carrera("Hit de Magallanes. Empatado.", "r1,b0"),
            T.pausa("Todo vuelve a estar parejo."),
            T.start("5.o inning. 2-2."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. Nadie out todavia."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Caracas no anota. Sigue 2-2."),
            T.start("Nadie toma la ventaja en el 5.o."),
          ],
        },
      ],
    },
    {
      inning: 6,
      title: "Juego clave",
      subtitle: "La defensa decide",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("6.o inning. Magallanes al bateo."),
            T.hit("Sencillo. Un out.", ON1),
            T.error("Error. El defensa se equivoca y abre las bases.", ON12),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes no aprovecha el error."),
            T.start("El error se queda sin castigo."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. Necesitan una."),
            T.hit("Sencillo de Caracas. Un out.", ON1),
            T.out("Out en segunda."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Se queda en primera. Sigue 2-2."),
            T.start("6.o inning. Nadie se separa."),
          ],
        },
      ],
    },
    {
      inning: 7,
      title: "Momento Pulse",
      subtitle: "La ultima gran oportunidad",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("7.o inning. Todo empatado a dos. Aqui se decide.", 0),
            T.doble("Doble de Magallanes por la esquina.", ON2, 8),
            T.ponche("Ponche. Un out.", "o", 20),
            T.hit("Hit de Magallanes. Runners en segunda y tercera.", ON23, 30),
            T.pausa("Magallanes tiene la entrada de la noche. Un out.", "", 40),
            T.pausa("MOMENTO PULSE. La pregunta para la tasca.", "m1", 48),
            T.carrera("Hit de Magallanes. Anota una. Toma la ventaja.", "r1,b0", 80),
            T.pausa("Magallanes se adelanta en el momento clave.", "", 90),
            T.pausa("Quedan dos innings para Caracas.", "", 106),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas necesita empatar abajo."),
            T.hit("Sencillo. Un out.", ON1),
            T.ponche("Ponche. Dos outs."),
            T.hit("Hit de Caracas. Runners en primera y segunda.", ON12),
            T.carrera("Hit de Caracas. Empatado.", "r1,b0"),
            T.pausa("Todo vuelve a estar parejo. El 8.o decide."),
            T.start("7.o inning cierra. 3-3."),
          ],
        },
      ],
    },
    {
      inning: 8,
      title: "Un inning de ninguna",
      subtitle: "Nadie anota",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("8.o inning. La tension es maxima."),
            T.ponche("Ponche. Un out."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Magallanes se va sin carreras. Sigue 3-3."),
            T.start("El 8.o se va sin anotacion."),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas tambien se va en blanco."),
            T.hit("Sencillo. Un out.", ON1),
            T.out("Out en segunda."),
            T.ponche("Ponche. Dos outs."),
            T.pausa("Cero. El 9.o lo decide todo."),
            T.start("8.o inning. Todo sigue 3-3."),
          ],
        },
      ],
    },
    {
      inning: 9,
      title: "Ultimo inning",
      subtitle: "La carrera que lo cambia todo",
      halves: [
        {
          half: "alta",
          beats: [
            T.start("9.o inning. Magallanes necesita una carrera.", 0),
            T.hit("Sencillo de Magallanes. Un out.", ON1, 10),
            T.hit("Hit. Runners en primera y segunda.", ON12, 22),
            T.ponche("Ponche. Dos outs.", "o", 34),
            T.pausa("Magallanes se retira sin carreras. Sigue 3-3.", "", 46),
            T.pausa("Caracas sale con la ultima jugada del juego.", "", 58),
            T.pausa("El estadio esta de pie.", "", 72),
          ],
        },
        {
          half: "baja",
          beats: [
            T.start("Caracas al bateo. DOS CARRERAS. ULTIMO INNING.", 0),
            T.hit("Sencillo de Caracas. Un out.", ON1, 12),
            T.hit("Hit de Caracas. Runners en primera y segunda.", ON12, 24),
            T.pausa("Runners en primera y segunda, un out. Falta una carrera.", "", 36),
            T.pausa("MOMENTO FINAL. La ultima pregunta de la noche.", "m3", 48),
            T.hit("Hit de Caracas. Runners en segunda y tercera, dos outs.", ON23, 74),
            T.pausa("Nadie out. El estadio entero esta de pie.", "", 84),
            T.hit("Hit de Caracas. Runners en tercera y primera.", "b5", 92),
            T.jonron("JONRON DE CARACAS. Anota la carrera del partido.", "r1,b0", 104),
            T.pausa("CARACAS GANA EN EL 9.o INNING. Fin del partido.", "", 116),
          ],
        },
      ],
    },
  ],
  moments: [
    {
      id: "ultimo-m1",
      inning: 7,
      at: 48,
      half: "alta",
      kind: "scored",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "Si Magallanes anota, toma la ventaja a dos innings del final.",
      prompt: "Anota Magallanes en esta entrada?",
      options: [
        { id: "si", label: "Si" },
        { id: "no", label: "No" },
      ],
      difficulty: M.fan,
      window: 24,
      resolveAt: 80,
      bonus: 5,
    },
    {
      id: "ultimo-m2",
      inning: 5,
      at: 60,
      half: "alta",
      kind: "winner",
      title: "Observacion",
      headline: "MOMENTO PULSE",
      lead: "Cuatro innings por jugar y todavia nadie se separa.",
      prompt: "Quien llega con ventaja al final del 5.o inning?",
      options: [
        { id: "caracas", label: "Caracas" },
        { id: "magallanes", label: "Magallanes" },
        { id: "empate", label: "Empate" },
      ],
      map: { home: "caracas", away: "magallanes", tie: "empate" },
      difficulty: M.easy,
      window: 34,
      resolveAt: 112,
    },
    {
      id: "ultimo-m3",
      inning: 9,
      at: 12,
      half: "baja",
      kind: "nextPlay",
      title: "Momento final",
      headline: "ULTIMO INNING",
      lead: "Caracas necesita una sola carrera. Runners en primera y segunda, un out. El local entero esta de pie.",
      prompt: "Que ocurre en la proxima jugada?",
      options: [
        { id: "ponche", label: "Ponche" },
        { id: "hit", label: "Hit" },
        { id: "dp", label: "Doble play" },
        { id: "jonron", label: "Jonron" },
      ],
      difficulty: M.medium,
      window: 24,
      resolveAt: 50,
      bonus: 5,
    },
    {
      id: "ultimo-m4",
      inning: 9,
      at: 36,
      half: "baja",
      kind: "scored",
      title: "Ultima jugada",
      headline: "MOMENTO FINAL",
      lead: "Runners en primera y segunda y un out. Caracas necesita una sola carrera.",
      prompt: "Marca Caracas en esta entrada?",
      options: [
        { id: "si", label: "Si" },
        { id: "no", label: "No" },
      ],
      difficulty: M.easy,
      window: 28,
      resolveAt: 84,
      bonus: 5,
    },
    {
      id: "ultimo-m5",
      inning: 6,
      at: 40,
      half: "alta",
      kind: "inningRuns",
      title: "Decision",
      headline: "MOMENTO PULSE",
      lead: "Magallanes cometio un error. Nadie sabe si lo aprovecha.",
      prompt: "Cuantas carreras anota Magallanes en este inning?",
      options: [
        { id: "0", label: "0" },
        { id: "1", label: "1" },
        { id: "2", label: "2 o mas" },
      ],
      difficulty: M.medium,
      window: 20,
      resolveAt: 69,
    },
  ],
};

export const SCENARIOS = [cerrado, remontada, ultimo];

// ---------------------------------------------------------------------------
// Emision de la migracion
// ---------------------------------------------------------------------------

function sql(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sql(JSON.stringify(value))}::jsonb`;
}

export function buildMigration() {
  const rows = SCENARIOS.map((scenario) => {
    const doc = buildScenario(scenario);
    return `  (
    ${sql(doc.id)},
    ${sql(doc.name)},
    ${sql(doc.description)},
    ${sql(doc.tension)},
    ${sql(doc.innings)},
    ${sql(doc.secondsPerInning)},
    ${sql(doc.finalHome)},
    ${sql(doc.finalAway)},
    ${sqlJson(doc)}
  )`;
  }).join(",\n");

  return `-- Pulse · Experiencia Juégate el Tobo · escenarios deterministas.
--
-- Estos guiones son la fuente de verdad de la simulacion. El motor del cliente
-- solo los reproduce: no inventa jugadas ni usa aleatoriedad. La puntuacion se
-- valida siempre contra este guion guardado, nunca contra el resultado oficial.

create table if not exists public.pulse_sim_scenarios (
  id text primary key,
  name text not null,
  description text not null default '',
  tension text not null default '',
  innings integer not null default 9,
  seconds_per_inning integer not null default 120,
  final_home integer not null default 0,
  final_away integer not null default 0,
  script jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.pulse_sim_scenarios (
  id, name, description, tension, innings, seconds_per_inning, final_home, final_away, script
) values
${rows}
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    tension = excluded.tension,
    innings = excluded.innings,
    seconds_per_inning = excluded.seconds_per_inning,
    final_home = excluded.final_home,
    final_away = excluded.final_away,
    script = excluded.script,
    active = true;
`;
}

// Ejecutado como script: escribe la migracion en UTF-8.
if (process.argv[1] && process.argv[1].endsWith("sim-scenarios.mjs")) {
  const target =
    process.argv.find((arg) => arg.endsWith(".sql")) ??
    "supabase/migrations/20260929190000_sim_scenarios.sql";
  writeFileSync(target, buildMigration(), "utf8");
  process.stdout.write(`Escenarios escritos en ${target}\n`);
}
