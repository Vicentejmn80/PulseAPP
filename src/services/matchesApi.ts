import { callRpc, readSessionToken } from "@/services/accountApi";
import type { LeaderboardEntry } from "@/types/pulse";

export type MatchStatus = "scheduled" | "locked" | "in_progress" | "finished" | "postponed" | "cancelled";

export interface MatchPrediction {
  id: string;
  winner: string;
  homeScore: number;
  awayScore: number;
  lockedAt: string | null;
  processed: boolean;
  winnerPoints: number | null;
  closenessPoints: number | null;
  total: number | null;
  errorTotal: number | null;
}

export interface BaseballMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  inning: number;
  half: "alta" | "baja";
  outs: number;
  featured: boolean;
  lastEventText: string;
  simulation: boolean;
  demo: boolean;
  prediction: MatchPrediction | null;
}

interface RpcResult {
  ok?: boolean;
  error?: string;
  id?: string;
  scored?: number;
  points?: number;
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asPrediction(value: unknown): MatchPrediction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.id) return null;
  return {
    id: String(row.id),
    winner: String(row.winner ?? ""),
    homeScore: asNumber(row.homeScore) ?? 0,
    awayScore: asNumber(row.awayScore) ?? 0,
    lockedAt: row.lockedAt ? String(row.lockedAt) : null,
    processed: Boolean(row.processed),
    winnerPoints: asNumber(row.winnerPoints),
    closenessPoints: asNumber(row.closenessPoints),
    total: asNumber(row.total),
    errorTotal: asNumber(row.errorTotal),
  };
}

function asMatch(value: unknown): BaseballMatch {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    homeTeam: String(row.homeTeam ?? ""),
    awayTeam: String(row.awayTeam ?? ""),
    startsAt: String(row.startsAt ?? ""),
    status: String(row.status ?? "scheduled") as MatchStatus,
    homeScore: asNumber(row.homeScore),
    awayScore: asNumber(row.awayScore),
    inning: asNumber(row.inning) ?? 1,
    half: row.half === "baja" ? "baja" : "alta",
    outs: asNumber(row.outs) ?? 0,
    featured: Boolean(row.featured),
    lastEventText: String(row.lastEventText ?? ""),
    simulation: Boolean(row.simulation),
    demo: Boolean(row.demo),
    prediction: asPrediction(row.prediction),
  };
}

async function expectOk<T extends RpcResult>(result: T) {
  if (!result?.ok) throw new Error(result?.error || "No se pudo completar.");
  return result;
}

export async function listMatches() {
  const data = await callRpc<unknown>("pulse_matches_list", { p_token: readSessionToken() });
  return (Array.isArray(data) ? data : []).map(asMatch);
}

export async function getMatch(matchId: string) {
  const matches = await listMatches();
  return matches.find((match) => match.id === matchId) ?? null;
}

export async function savePrediction(input: {
  matchId: string;
  winner: string;
  homeScore: number;
  awayScore: number;
}) {
  const result = await callRpc<RpcResult>("pulse_save_prediction", {
    p_token: readSessionToken(),
    p_match_id: input.matchId,
    p_winner: input.winner,
    p_home_score: input.homeScore,
    p_away_score: input.awayScore,
  });
  return expectOk(result);
}

export async function createMatch(input: { adminKey: string; homeTeam: string; awayTeam: string; startsAt: string }) {
  const result = await callRpc<RpcResult>("pulse_admin_create_match", {
    p_admin_key: input.adminKey,
    p_home: input.homeTeam,
    p_away: input.awayTeam,
    p_starts_at: input.startsAt,
  });
  return expectOk(result);
}

export async function setMatchResult(input: { adminKey: string; matchId: string; homeScore: number; awayScore: number }) {
  const result = await callRpc<RpcResult>("pulse_admin_set_result", {
    p_admin_key: input.adminKey,
    p_match_id: input.matchId,
    p_home_score: input.homeScore,
    p_away_score: input.awayScore,
  });
  return expectOk(result);
}

export interface ToboCycle {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
}

export interface Tasca {
  id: string;
  name: string;
  zone: string;
  address: string;
  contact: string;
  broadcasts: string;
  instagram: string;
  whatsapp: string;
  roundPrize: string;
  gamesAiring: { id: string; awayTeam: string; homeTeam: string; startsAt: string }[];
  isFounder: boolean;
  slug?: string;
  logoUrl?: string;
  city?: string;
  description?: string;
  sponsorText?: string;
  prizeDetail?: string;
  prizeQuantity?: number;
  prizeTerms?: string;
  active?: boolean;
  lat?: number | null;
  lng?: number | null;
  highlights?: Array<{ icon: string; title: string; desc: string }>;
  imageUrl?: string;
}

export interface ToboPrize {
  id: string;
  cycleId: string;
  cycleName: string;
  rank: number;
  code: string;
  status: string;
  expiresAt: string;
  seenAt?: string | null;
  daysLeft?: number;
  prizeName?: string;
}

export async function listRanking(cycle = "lifetime") {
  const data = await callRpc<LeaderboardEntry[]>("pulse_ranking", { p_token: readSessionToken(), p_cycle: cycle });
  return Array.isArray(data) ? data : [];
}

export async function listCycles() {
  const data = await callRpc<ToboCycle[]>("pulse_cycles_list", {});
  return Array.isArray(data) ? data : [];
}

export async function listTascas() {
  const data = await callRpc<Tasca[]>("pulse_venues_list", {});
  return Array.isArray(data) ? data : [];
}

export async function myPrizes() {
  return callRpc<{ eligible: boolean; prizes: ToboPrize[] }>("pulse_my_prizes", { p_token: readSessionToken() });
}

export async function markPrizeSeen(prizeId: string) {
  return callRpc<{ ok?: boolean }>("pulse_prize_mark_seen", {
    p_token: readSessionToken(),
    p_prize_id: prizeId,
  });
}

export async function postponeMatch(input: { adminKey: string; matchId: string; startsAt: string }) {
  return expectOk(await callRpc<RpcResult>("pulse_admin_postpone", {
    p_admin_key: input.adminKey,
    p_match_id: input.matchId,
    p_starts_at: input.startsAt,
  }));
}

export async function cancelMatch(input: { adminKey: string; matchId: string }) {
  return expectOk(await callRpc<RpcResult>("pulse_admin_cancel", {
    p_admin_key: input.adminKey,
    p_match_id: input.matchId,
  }));
}

export async function saveTasca(input: { adminKey: string; name: string; zone: string; address: string; contact: string; founder: boolean }) {
  return expectOk(await callRpc<RpcResult>("pulse_admin_save_venue", {
    p_admin_key: input.adminKey,
    p_name: input.name,
    p_zone: input.zone,
    p_address: input.address,
    p_contact: input.contact,
    p_founder: input.founder,
  }));
}

export async function closeRound(input: { adminKey: string; cycleId: string }) {
  return expectOk(await callRpc<RpcResult & { awarded?: number; already?: boolean }>("pulse_admin_close_round", {
    p_admin_key: input.adminKey,
    p_cycle: input.cycleId,
  }));
}

export async function createCycle(input: { adminKey: string; id: string; name: string; startsOn: string; endsOn: string }) {
  return expectOk(await callRpc<RpcResult>("pulse_admin_create_cycle", {
    p_admin_key: input.adminKey,
    p_id: input.id,
    p_name: input.name,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
  }));
}

export interface AdminPrizeCode {
  id: string;
  code: string;
  status: string;
  rank: number;
  cycleName: string;
  alias: string;
  expiresAt: string;
  venueName?: string | null;
  daysLeft: number;
}

export async function listAdminPrizes(adminKey: string) {
  const data = await callRpc<AdminPrizeCode[]>("pulse_admin_prizes", { p_admin_key: adminKey });
  return Array.isArray(data) ? data : [];
}

export async function redeemPrize(input: { adminKey: string; code: string; venueId?: string }) {
  return expectOk(await callRpc<RpcResult & { already?: boolean }>("pulse_admin_redeem", {
    p_admin_key: input.adminKey,
    p_code: input.code,
    p_venue_id: input.venueId || null,
  }));
}

export function matchPhase(match: BaseballMatch): "open" | "live" | "locked" | "finished" | "cancelled" {
  if (match.status === "finished") return "finished";
  if (match.status === "cancelled") return "cancelled";
  if (match.status === "in_progress") return "live";
  if (match.status === "locked" || new Date(match.startsAt).getTime() <= Date.now()) return "locked";
  return "open";
}

export function scoreLine(match: Pick<BaseballMatch, "homeTeam" | "awayTeam">, homeScore: number, awayScore: number) {
  return `${match.awayTeam} ${awayScore} — ${homeScore} ${match.homeTeam}`;
}
