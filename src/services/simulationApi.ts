import { callRpc, readSessionToken } from "@/services/accountApi";
import type { ScenarioSummary, SimulationScript, SimulationSpeed } from "@/lib/simulation/types";
import { SPEEDS } from "@/lib/simulation/types";

/**
 * Contratos de la experiencia de simulacion.
 *
 * El servidor es dueno del guion y del scoring. El cliente es dueno del reloj.
 * Estas funciones no inventan jugadas: solo asking al servidor por el guion
 * guardado y por la validacion de cada respuesta.
 */

export type SessionStatus = "none" | "live" | "finished";

export interface MomentAnswer {
  id: string;
  optionId: string | null;
}

export interface SimulationSession {
  ok: boolean;
  error?: string;
  status: SessionStatus;
  label: string;
  scenarioId: string;
  answers: MomentAnswer[];
  hits: number;
  answered: number;
  bonus: number;
  finished: boolean;
}

const emptySession: SimulationSession = {
  ok: true,
  status: "none",
  label: "SIMULACION",
  scenarioId: "",
  answers: [],
  hits: 0,
  answered: 0,
  bonus: 0,
  finished: false,
};

function asScript(value: unknown): SimulationScript | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SimulationScript>;
  if (!Array.isArray(row.timeline) || !Array.isArray(row.moments)) return null;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    tension: String(row.tension ?? ""),
    innings: Number(row.innings ?? 9),
    secondsPerInning: Number(row.secondsPerInning ?? 120),
    finalHome: Number(row.finalHome ?? 0),
    finalAway: Number(row.finalAway ?? 0),
    inningStarts: Array.isArray(row.inningStarts) ? row.inningStarts : [],
    timeline: row.timeline,
    moments: row.moments,
  };
}

function asSummary(value: unknown): ScenarioSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const script = asScript(row.script);
  if (!script) return null;
  return {
    id: String(row.id ?? script.id),
    name: String(row.name ?? script.name),
    description: String(row.description ?? script.description),
    tension: String(row.tension ?? script.tension),
    innings: Number(row.innings ?? script.innings),
    secondsPerInning: Number(row.secondsPerInning ?? script.secondsPerInning),
    finalHome: Number(row.finalHome ?? script.finalHome),
    finalAway: Number(row.finalAway ?? script.finalAway),
    script,
  };
}

function asSession(value: unknown): SimulationSession {
  const row = (value ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return { ...emptySession, ok: false, error: String(row.error ?? "No se pudo completar.") };
  }
  const status = row.status === "live" || row.status === "finished" ? row.status : "none";
  return {
    ok: true,
    status,
    label: String(row.label ?? "SIMULACION"),
    scenarioId: String(row.scenarioId ?? ""),
    answers: Array.isArray(row.answers)
      ? (row.answers as Record<string, unknown>[]).map((item) => ({
          id: String(item.id ?? ""),
          optionId: item.optionId ? String(item.optionId) : null,
        }))
      : [],
    hits: Number(row.hits ?? 0),
    answered: Number(row.answered ?? 0),
    bonus: Number(row.bonus ?? 0),
    finished: Boolean(row.finished),
  };
}

/** Los escenarios disponibles. Sin argumentos: es publico por diseño. */
export async function listScenarios() {
  const data = await callRpc<unknown>("pulse_sim_scenarios_list", {});
  const rows = Array.isArray(data) ? data : [];
  return rows.map(asSummary).filter((row): row is ScenarioSummary => row !== null);
}

export async function simulationSession(matchId: string) {
  return asSession(await callRpc("pulse_demo_state", { p_token: readSessionToken(), p_match: matchId }));
}

export async function startSimulationSession(matchId: string, scenarioId: string) {
  const result = asSession(
    await callRpc("pulse_demo_start", {
      p_token: readSessionToken(),
      p_match: matchId,
      p_scenario: scenarioId,
    }),
  );
  if (!result.ok) throw new Error(result.error || "No se pudo empezar la experiencia.");
  return result;
}

export async function answerSimulationMoment(matchId: string, momentId: string, optionId: string) {
  const result = asSession(
    await callRpc("pulse_demo_answer", {
      p_token: readSessionToken(),
      p_match: matchId,
      p_question: momentId,
      p_option: optionId,
    }),
  );
  if (!result.ok) throw new Error(result.error || "No se pudo responder.");
  return result;
}

export async function finishSimulationSession(matchId: string) {
  const result = asSession(
    await callRpc("pulse_demo_finish", { p_token: readSessionToken(), p_match: matchId }),
  );
  if (!result.ok) throw new Error(result.error || "No se pudo cerrar la experiencia.");
  return result;
}

/** Eventos analiticos. La lista la valida el servidor. */
export async function logSimulationEvent(matchId: string, type: string, dedupe: string) {
  await callRpc("pulse_demo_log", {
    p_token: readSessionToken(),
    p_match: matchId,
    p_type: type,
    p_dedupe: dedupe,
  });
}

export interface AdminPreview {
  ok: boolean;
  error?: string;
  scenarioId: string;
  name: string;
  description: string;
  innings: number;
  secondsPerInning: number;
  finalHome: number;
  finalAway: number;
  script: SimulationScript;
}

/**
 * Vista previa para el Demo Control.
 *
 * No crea sesion ni toca puntos: solo entrega el guion. La proteccion es la
 * misma clave de admin que ya usa el resto del area.
 */
export async function adminSimulationPreview(adminKey: string, scenarioId: string) {
  const data = await callRpc<Record<string, unknown>>("pulse_admin_sim_preview", {
    p_admin_key: adminKey,
    p_scenario: scenarioId,
  });
  const script = asScript(data?.script);
  if (!data?.ok || !script) {
    throw new Error(String(data?.error ?? "No se pudo abrir ese escenario."));
  }
  return {
    ok: true,
    scenarioId: String(data.scenarioId ?? script.id),
    name: String(data.name ?? script.name),
    description: String(data.description ?? script.description),
    innings: Number(data.innings ?? script.innings),
    secondsPerInning: Number(data.secondsPerInning ?? script.secondsPerInning),
    finalHome: Number(data.finalHome ?? script.finalHome),
    finalAway: Number(data.finalAway ?? script.finalAway),
    script,
  } satisfies AdminPreview;
}

export function isSimulationSpeed(value: number): value is SimulationSpeed {
  return (SPEEDS as number[]).includes(value);
}
