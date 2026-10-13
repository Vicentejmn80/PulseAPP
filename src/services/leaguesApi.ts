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

const JOIN_CODE_KEY = "rusher-league-join-code";

export function savePendingLeagueCode(code: string) {
  try {
    sessionStorage.setItem(JOIN_CODE_KEY, code.trim().toUpperCase());
  } catch {
    /* modo privado */
  }
}

export function readPendingLeagueCode() {
  try {
    return sessionStorage.getItem(JOIN_CODE_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingLeagueCode() {
  try {
    sessionStorage.removeItem(JOIN_CODE_KEY);
  } catch {
    /* modo privado */
  }
}

export interface LeaguePreview {
  ok: boolean;
  error?: string;
  name?: string;
  code?: string;
  memberCount?: number;
  inviter?: string;
  alreadyMember?: boolean;
  full?: boolean;
}

export async function previewLeague(code: string) {
  return callRpc<LeaguePreview>("pulse_league_preview", { p_code: code });
}

export async function inviteLeagueAlias(leagueId: string, alias: string) {
  const result = await callRpc<OkResult>("pulse_league_invite_alias", {
    p_token: readSessionToken(),
    p_league_id: leagueId,
    p_alias: alias,
  });
  expectOk(result);
}

export async function respondLeagueInvite(inviteId: string, accept: boolean) {
  const result = await callRpc<OkResult & { league?: unknown }>("pulse_league_invite_respond", {
    p_token: readSessionToken(),
    p_invite_id: inviteId,
    p_accept: accept,
  });
  expectOk(result);
  return result.league ? asLeague(result.league) : null;
}

export async function searchLeagueInvitees(leagueId: string, prefix: string) {
  const result = await callRpc<{ ok?: boolean; aliases?: { alias: string }[] }>("pulse_league_invite_search", {
    p_token: readSessionToken(),
    p_league_id: leagueId,
    p_prefix: prefix,
  });
  return (result?.aliases ?? []).map((row) => row.alias).filter(Boolean).slice(0, 5);
}

export async function myLeagueInvites() {
  const result = await callRpc<{ ok?: boolean; items?: { id: string; league: string; from: string }[] }>("pulse_league_my_invites", {
    p_token: readSessionToken(),
  });
  return Array.isArray(result?.items) ? result.items : [];
}

export async function regenLeagueCode(leagueId: string) {
  const result = await callRpc<OkResult & { league?: unknown }>("pulse_league_regen_code", {
    p_token: readSessionToken(),
    p_league_id: leagueId,
  });
  expectOk(result);
  return asLeague(result.league ?? {});
}

export async function removeLeagueMember(leagueId: string, userId: string) {
  const result = await callRpc<OkResult>("pulse_league_remove_member", {
    p_token: readSessionToken(),
    p_league_id: leagueId,
    p_user_id: userId,
  });
  expectOk(result);
}

export async function listAllLeaguesAdmin(adminKey: string) {
  const result = await callRpc<OkResult & { leagues?: unknown }>("pulse_admin_league_list", {
    p_admin_key: adminKey,
  });
  expectOk(result);
  const rows = Array.isArray(result.leagues) ? result.leagues : [];
  return rows.map(asLeague);
}
