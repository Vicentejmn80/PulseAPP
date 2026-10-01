import { callRpc, readSessionToken } from "@/services/accountApi";
import type { LeaderboardEntry } from "@/types/pulse";

export interface League {
  id: string;
  name: string;
  code: string;
  ownerUserId: string;
  memberCount: number;
  isOwner: boolean;
}

interface OkResult {
  ok?: boolean;
  error?: string;
  league?: League;
}

function expectOk<T extends OkResult>(result: T) {
  if (!result?.ok) throw new Error(result?.error || "No se pudo completar.");
  return result;
}

function asLeague(value: unknown): League {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    code: String(row.code ?? ""),
    ownerUserId: String(row.ownerUserId ?? ""),
    memberCount: Number(row.memberCount ?? 0),
    isOwner: Boolean(row.isOwner),
  };
}

export async function createLeague(name: string) {
  const result = await callRpc<OkResult & { league?: unknown }>("pulse_league_create", {
    p_token: readSessionToken(),
    p_name: name,
  });
  expectOk(result);
  return asLeague(result.league ?? {});
}

export async function joinLeague(code: string) {
  const result = await callRpc<OkResult & { league?: unknown }>("pulse_league_join", {
    p_token: readSessionToken(),
    p_code: code,
  });
  expectOk(result);
  return asLeague(result.league ?? {});
}

export async function listMyLeagues() {
  const data = await callRpc<unknown>("pulse_league_list", { p_token: readSessionToken() });
  const rows = Array.isArray(data) ? data : [];
  return rows.map(asLeague);
}

export async function getLeague(leagueId: string) {
  const result = await callRpc<OkResult & { id?: string; name?: string; code?: string; ownerUserId?: string; memberCount?: number; isOwner?: boolean }>(
    "pulse_league_detail",
    { p_token: readSessionToken(), p_league_id: leagueId }
  );
  if (!result?.id) return null;
  return asLeague(result);
}

export async function getLeagueRanking(leagueId: string, cycle = "lifetime") {
  const data = await callRpc<LeaderboardEntry[]>("pulse_league_ranking", {
    p_token: readSessionToken(),
    p_league_id: leagueId,
    p_cycle: cycle,
  });
  return Array.isArray(data) ? data : [];
}

export async function listAllLeaguesAdmin(adminKey: string) {
  const result = await callRpc<OkResult & { leagues?: unknown }>("pulse_admin_league_list", {
    p_admin_key: adminKey,
  });
  expectOk(result);
  const rows = Array.isArray(result.leagues) ? result.leagues : [];
  return rows.map(asLeague);
}
