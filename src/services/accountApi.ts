import { createClient } from "@supabase/supabase-js";
import { SEED_TRANSACTIONS, USERS } from "@/data/mock/catalog";
import type { Game, Participation, PointsTransaction, UserProfile } from "@/types/pulse";

const SESSION_KEY = "pulse-session";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://ovgwqeoslaitsmhdkxbl.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Z3dxZW9zbGFpdHNtaGRreGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDA3NDcsImV4cCI6MjEwNTc3Njc0N30.T6e7hMV-BkuI_RJtRm2qMax5n7DmbTJpNYLVGpO-Vd8";

export interface AccountSnapshot {
  token: string;
  currentUser: UserProfile;
  users: UserProfile[];
  participations: Participation[];
  transactions: PointsTransaction[];
  completedMissionIds: string[];
  predictionPicks: Record<string, string>;
  extraGames: Game[];
}

interface ApiResult extends Partial<AccountSnapshot> {
  ok: boolean;
  error?: string;
  awarded?: number;
  gamePoints?: number;
}

function supabaseClient() {
  if (!SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function readSessionToken() {
  return localStorage.getItem(SESSION_KEY) ?? "";
}

export function writeSessionToken(token: string) {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

function apiBase() {
  if (import.meta.env.DEV) return "";
  return window.location.origin;
}

async function post(body: Record<string, unknown>): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/pulse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu internet e intenta otra vez.");
  }

  let result: ApiResult;
  try {
    result = (await response.json()) as ApiResult;
  } catch {
    throw new Error("El servidor respondió de forma inesperada. Intenta en unos segundos.");
  }

  if (!result.ok) throw new Error(result.error || "No se pudo guardar.");
  return result;
}

async function rpcRegister(phone: string, alias: string): Promise<ApiResult | null> {
  const supabase = supabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("pulse_register", { p_phone: phone, p_alias: alias });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("Could not find the function")) return null;
    throw new Error(error.message);
  }
  return data as ApiResult;
}

async function rpcLogin(phone: string, accessCode: string): Promise<ApiResult | null> {
  const supabase = supabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("pulse_login", { p_phone: phone, p_access_code: accessCode });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("Could not find the function")) return null;
    throw new Error(error.message);
  }
  return data as ApiResult;
}

async function rpcLoad(token: string): Promise<ApiResult | null> {
  const supabase = supabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("pulse_load", { p_token: token });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("Could not find the function")) return null;
    throw new Error(error.message);
  }
  return data as ApiResult;
}

function mergeUsers(users: UserProfile[] = []) {
  const map = new Map<string, UserProfile>();
  for (const user of USERS) map.set(user.id, user);
  for (const user of users) map.set(user.id, user);
  return [...map.values()];
}

function asSnapshot(result: ApiResult, token: string): AccountSnapshot {
  if (!result.currentUser) throw new Error("El servidor no devolvió el perfil.");
  const userTx = (result.transactions ?? []).filter((tx) => tx.userId === result.currentUser!.id);
  return {
    token,
    currentUser: result.currentUser,
    users: mergeUsers(result.users),
    participations: result.participations ?? [],
    transactions: [...SEED_TRANSACTIONS, ...userTx],
    completedMissionIds: result.completedMissionIds ?? [],
    predictionPicks: result.predictionPicks ?? {},
    extraGames: result.extraGames ?? [],
  };
}

async function dispatch(body: Record<string, unknown>) {
  const action = String(body.action ?? "");
  if (action === "register") {
    const rpc = await rpcRegister(String(body.phone ?? ""), String(body.alias ?? ""));
    if (rpc) return rpc;
  }
  if (action === "login") {
    const rpc = await rpcLogin(String(body.phone ?? ""), String(body.accessCode ?? ""));
    if (rpc) return rpc;
  }
  if (action === "load") {
    const rpc = await rpcLoad(String(body.token ?? ""));
    if (rpc) return rpc;
  }
  return post(body);
}

export async function registerAccount(phone: string, alias: string) {
  const result = await dispatch({ action: "register", phone, alias });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function loginAccount(phone: string, accessCode: string) {
  const result = await dispatch({ action: "login", phone, accessCode });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function loadAccount() {
  const token = readSessionToken();
  if (!token) return null;
  try {
    const result = await dispatch({ action: "load", token });
    return asSnapshot(result, token);
  } catch {
    writeSessionToken("");
    return null;
  }
}

export async function completeOnServer(input: { gameId: string; answers?: number[]; answer?: number; optionId?: string }) {
  const token = readSessionToken();
  const result = await dispatch({ action: "complete", token, ...input });
  return { awarded: result.awarded ?? 0, gamePoints: result.gamePoints ?? result.awarded ?? 0, snapshot: asSnapshot(result, token) };
}

export async function addGameOnServer(game: Game) {
  const token = readSessionToken();
  const result = await dispatch({ action: "addGame", token, game });
  return asSnapshot(result, token);
}
