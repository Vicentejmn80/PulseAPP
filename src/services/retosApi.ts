import { callRpc, readSessionToken } from "@/services/accountApi";

const DEVICE_KEY = "pulse-device-id";

export function retoDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

export interface RetoAlias {
  alias: string;
}

export interface RetoItem {
  id: string;
  kind: "game" | "trivia";
  matchId: string;
  triviaLevel: string;
  status: string;
  stake: number;
  message: string;
  rival: string;
  incoming: boolean;
  label: string;
  acceptUntil: string | null;
  h2hMine: number;
  h2hTheirs: number;
  mineScore: number | null;
  rivalScore: number | null;
  outcome: "won" | "lost" | "tie" | "void" | "pending" | "live" | "rejected" | "expired";
}

export interface RetoBoard {
  ok: boolean;
  error?: string;
  won: number;
  lost: number;
  pending: number;
  points: number;
  maxStake: number;
  items: RetoItem[];
}

interface OkResult {
  ok?: boolean;
  error?: string;
}

function token() {
  return readSessionToken();
}

export interface RetoPrefs {
  adultConfirmed: boolean;
  introSeen: boolean;
  recent: string[];
}

export async function retoPrefs(): Promise<RetoPrefs> {
  const result = await callRpc<{ ok?: boolean; adultConfirmed?: boolean; introSeen?: boolean; recent?: string[] }>("pulse_reto_prefs", {
    p_token: token(),
  });
  return {
    adultConfirmed: Boolean(result?.adultConfirmed),
    introSeen: Boolean(result?.introSeen),
    recent: Array.isArray(result?.recent) ? result.recent.map(String).slice(0, 6) : [],
  };
}

export async function retoAckIntro() {
  await callRpc("pulse_reto_intro_ack", { p_token: token() });
}

export async function retoBoard() {
  const result = await callRpc<RetoBoard>("pulse_reto_board", {
    p_token: token(),
  });
  return {
    ...result,
    items: Array.isArray(result?.items) ? result.items : [],
    won: result?.won ?? 0,
    lost: result?.lost ?? 0,
    pending: result?.pending ?? 0,
    points: result?.points ?? 0,
    maxStake: result?.maxStake ?? 0,
  };
}

export async function retoSearch(prefix: string) {
  const result = await callRpc<{ ok?: boolean; error?: string; aliases?: RetoAlias[] }>("pulse_reto_search", {
    p_token: token(),
    p_prefix: prefix,
  });
  if (result?.ok === false) throw new Error(result.error || "No se pudo buscar.");
  return (result?.aliases ?? []).map((row) => row.alias).filter(Boolean).slice(0, 5);
}

export async function retoCreate(input: {
  kind: "game" | "trivia";
  alias: string;
  stake: number;
  message: string;
  matchId?: string;
  triviaLevel?: string;
  adult: boolean;
}) {
  const result = await callRpc<OkResult & { alias?: string; stake?: number }>("pulse_reto_create", {
    p_token: token(),
    p_kind: input.kind,
    p_alias: input.alias,
    p_stake: input.stake,
    p_message: input.message,
    p_match_id: input.matchId ?? "",
    p_trivia_level: input.triviaLevel ?? "",
    p_device: retoDeviceId(),
    p_adult: input.adult,
  });
  if (!result?.ok) throw new Error(result?.error || "No se pudo enviar el reto.");
  return result;
}

export async function retoRespond(id: string, accept: boolean) {
  const result = await callRpc<OkResult>("pulse_reto_respond", {
    p_token: token(),
    p_reto_id: id,
    p_accept: accept,
    p_device: retoDeviceId(),
    p_adult: true,
  });
  if (!result?.ok) throw new Error(result?.error || "No se pudo responder el reto.");
}

export async function retoBlock(alias: string) {
  const result = await callRpc<OkResult>("pulse_reto_block", {
    p_token: token(),
    p_alias: alias,
  });
  if (!result?.ok) throw new Error(result?.error || "No se pudo bloquear.");
}
