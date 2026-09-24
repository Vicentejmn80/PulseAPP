import type { Game, Participation, PointsTransaction, UserProfile } from "@/types/pulse";

const SESSION_KEY = "pulse-session";

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

export function readSessionToken() {
  return localStorage.getItem(SESSION_KEY) ?? "";
}

export function writeSessionToken(token: string) {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

async function post(body: Record<string, unknown>): Promise<ApiResult> {
  const response = await fetch("/api/pulse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as ApiResult;
  if (!result.ok) throw new Error(result.error || "No se pudo guardar.");
  return result;
}

function asSnapshot(result: ApiResult, token: string): AccountSnapshot {
  if (!result.currentUser) throw new Error("El servidor no devolvió el perfil.");
  return {
    token,
    currentUser: result.currentUser,
    users: result.users ?? [],
    participations: result.participations ?? [],
    transactions: result.transactions ?? [],
    completedMissionIds: result.completedMissionIds ?? [],
    predictionPicks: result.predictionPicks ?? {},
    extraGames: result.extraGames ?? [],
  };
}

export async function registerAccount(phone: string, alias: string) {
  const result = await post({ action: "register", phone, alias });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function loginAccount(phone: string, accessCode: string) {
  const result = await post({ action: "login", phone, accessCode });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function loadAccount() {
  const token = readSessionToken();
  if (!token) return null;
  try {
    const result = await post({ action: "load", token });
    return asSnapshot(result, token);
  } catch {
    writeSessionToken("");
    return null;
  }
}

export async function completeOnServer(input: { gameId: string; answers?: number[]; answer?: number; optionId?: string }) {
  const token = readSessionToken();
  const result = await post({ action: "complete", token, ...input });
  return { awarded: result.awarded ?? 0, gamePoints: result.gamePoints ?? result.awarded ?? 0, snapshot: asSnapshot(result, token) };
}

export async function addGameOnServer(game: Game) {
  const token = readSessionToken();
  const result = await post({ action: "addGame", token, game });
  return asSnapshot(result, token);
}
