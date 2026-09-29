import { callRpc, readSessionToken } from "@/services/accountApi";

export interface LiveEvent {
  id: string;
  inning: number;
  half: "alta" | "baja";
  type: string;
  description: string;
  homeScore: number;
  awayScore: number;
  createdAt: string;
}

export interface BingoPick {
  id: string;
  label: string;
  resolvedAt: string | null;
}

export interface CrowdOption {
  team?: string;
  id?: string;
  label?: string;
  percent: number;
}

export interface CrowdShare {
  hidden?: boolean;
  total?: number;
  options?: CrowdOption[];
}

export interface CenterDuel {
  id: string;
  status: string;
  opponent: string;
  mine: number | null;
  theirs: number | null;
  iWon: boolean;
  tie: boolean;
}

export interface CenterQuestion {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  status: string;
  closesAt: string | null;
  myOption: string | null;
  correctOption: string | null;
  points: number | null;
  livePoints: number;
  share: CrowdShare | null;
}

export interface MatchCenter {
  ok?: boolean;
  error?: string;
  match: {
    id: string;
    awayTeam: string;
    homeTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    inning: number;
    half: "alta" | "baja";
    outs: number;
    featured: boolean;
    momentum: number;
    lastEventText: string;
    status: string;
    simulation: boolean;
  };
  prediction: { winner: string; homeScore: number; awayScore: number } | null;
  closeness: { errorTotal: number; closenessPoints: number; mood: "cerca" | "lejos" } | null;
  events: LiveEvent[];
  bingo: { points: number; picks: BingoPick[] };
  live: CenterQuestion[];
  winnerShare: CrowdShare | null;
  duels: CenterDuel[];
}

interface OkResult {
  ok?: boolean;
  error?: string;
  matchId?: string;
  pending?: boolean;
  alias?: string;
  running?: boolean;
  status?: string;
  step?: number;
  total?: number;
  inning?: number;
  half?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  seconds?: number;
}

async function ok<T extends OkResult>(result: T) {
  if (!result?.ok) throw new Error(result?.error || "No se pudo completar.");
  return result;
}

export async function matchCenter(matchId: string) {
  return callRpc<MatchCenter>("pulse_match_center", { p_token: readSessionToken(), p_match: matchId });
}

export async function openLive(adminKey: string, matchId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_open_live", { p_admin_key: adminKey, p_match: matchId }));
}

export async function addEvent(input: {
  adminKey: string;
  matchId: string;
  inning: number;
  half: "alta" | "baja";
  type: string;
  description: string;
  homeScore: number;
  awayScore: number;
}) {
  return ok(await callRpc<OkResult>("pulse_admin_add_event", {
    p_admin_key: input.adminKey,
    p_match: input.matchId,
    p_inning: input.inning,
    p_half: input.half,
    p_type: input.type,
    p_description: input.description,
    p_home: input.homeScore,
    p_away: input.awayScore,
  }));
}

export async function challengeAlias(matchId: string, alias: string) {
  return ok(await callRpc<OkResult>("pulse_duel_challenge", {
    p_token: readSessionToken(),
    p_match: matchId,
    p_alias: alias,
  }));
}

export async function startSimulation(adminKey: string, seconds: number) {
  return ok(await callRpc<OkResult>("pulse_admin_sim_start", {
    p_admin_key: adminKey,
    p_token: readSessionToken(),
    p_interval: seconds,
  }));
}

export async function stopSimulation(adminKey: string) {
  return ok(await callRpc<OkResult>("pulse_admin_sim_stop", { p_admin_key: adminKey }));
}

export function simulationStatus(adminKey: string) {
  return callRpc<OkResult>("pulse_admin_sim_status", { p_admin_key: adminKey });
}

export interface ReporterState {
  ok?: boolean;
  error?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  inning: number;
  half: "alta" | "baja";
  outs: number;
  status: string;
  featured: boolean;
  simulation: boolean;
  lastEventText: string;
  reports: number;
}

export function reporterState(adminKey: string, matchId: string) {
  return callRpc<ReporterState>("pulse_reporter_state", { p_admin_key: adminKey, p_match: matchId });
}

export async function reporterTap(adminKey: string, matchId: string, action: "run_home" | "run_away" | "out" | "inning_change") {
  return ok(await callRpc<ReporterState & OkResult>("pulse_reporter_tap", {
    p_admin_key: adminKey,
    p_match: matchId,
    p_action: action,
  }));
}

export async function reporterFinish(adminKey: string, matchId: string) {
  return ok(await callRpc<OkResult>("pulse_reporter_finish", { p_admin_key: adminKey, p_match: matchId }));
}

export async function featureLive(adminKey: string, matchId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_feature_live", { p_admin_key: adminKey, p_match: matchId }));
}

export async function unfeatureLive(adminKey: string, matchId: string) {
  return ok(await callRpc<OkResult>("pulse_admin_unfeature", { p_admin_key: adminKey, p_match: matchId }));
}

export async function setInningKind(adminKey: string, kind: "runs" | "count" | "first") {
  return ok(await callRpc<OkResult>("pulse_admin_set_inning_kind", { p_admin_key: adminKey, p_kind: kind }));
}
