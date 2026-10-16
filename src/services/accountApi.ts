import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decideSession } from "@/lib/sessionGate";
import type { Game, Participation, PointsTransaction, UserProfile } from "@/types/pulse";

const SESSION_KEY = "pulse-session";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

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

let sharedClient: SupabaseClient | null = null;

function supabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY");
  }
  if (!sharedClient) {
    sharedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "pulse-rpc-auth",
      },
    });
  }
  return sharedClient;
}

export async function callRpc<T>(fn: string, args: Record<string, unknown>) {
  const supabase = supabaseClient();
  if (!supabase) throw new Error("No hay conexión con el servidor.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function markOnboardingSeen() {
  const token = readSessionToken();
  const result = await callRpc<{ ok?: boolean; error?: string }>("pulse_mark_onboarding", { p_token: token });
  if (!result.ok) throw new Error(result.error || "No se pudo guardar la bienvenida.");
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

function asSnapshot(result: ApiResult, token: string): AccountSnapshot {
  if (!result.currentUser) throw new Error("El servidor no devolvió el perfil.");
  const userTx = (result.transactions ?? []).filter((tx) => tx.userId === result.currentUser!.id);
  const safeUser = { ...result.currentUser };
  delete safeUser.accessCode;
  return {
    token,
    currentUser: safeUser,
    users: result.users ?? [],
    participations: result.participations ?? [],
    transactions: userTx,
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

export class FlowError extends Error {
  code: string;
  retryAfter?: number;

  constructor(message: string, code = "REGISTRATION_ERROR", retryAfter?: number) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const FLOW_COPY: Record<string, string> = {
  TWILIO_SANDBOX_NOT_JOINED:
    "Este número todavía no está conectado al WhatsApp de Pulse. Envía el mensaje de unión al +1 737 250 8034 y vuelve a intentarlo.",
  TWILIO_INVALID_NUMBER: "Revisa el número de teléfono.",
  INVALID_PHONE: "Revisa el número de teléfono.",
  TWILIO_AUTH_ERROR: "Hay un problema temporal con el servicio de WhatsApp. Inténtalo nuevamente.",
  TWILIO_ERROR: "No pudimos enviar el código. Inténtalo nuevamente.",
  TWILIO_TEMPLATE_REQUIRED:
    "WhatsApp no dejó enviar el código en texto libre. Esta cuenta de Twilio exige una plantilla OTP aprobada.",
  OTP_RATE_LIMITED: "Has solicitado demasiados códigos. Espera unos minutos antes de intentarlo nuevamente.",
  OTP_INVALID: "Código incorrecto.",
  OTP_EXPIRED: "El código expiró. Pide uno nuevo.",
  ALIAS_ALREADY_TAKEN: "Ese alias ya está ocupado.",
  INVALID_ALIAS: "Usa de 3 a 20 letras, números o _. Sin espacios.",
  PHONE_ALREADY_REGISTERED: "Ese número ya tiene perfil. Entra de nuevo.",
  PHONE_NOT_VERIFIED: "La verificación expiró. Pide un código nuevo.",
  INVALID_FULL_NAME: "Escribe tu nombre completo.",
  OTP_DISABLED: "El login por WhatsApp está desactivado temporalmente.",
  DIRECT_ENTER_DISABLED: "Crea tu cuenta con nombre, alias, teléfono y PIN.",
  INVALID_PIN: "El PIN debe tener 6 números y no ser una secuencia obvia.",
  AUTH_INVALID: "No pudimos validar tus credenciales.",
  AUTH_UNAVAILABLE: "Servicio no disponible. Inténtalo en unos minutos.",
  ACCOUNT_NOT_FOUND: "No encontramos una cuenta con este número.",
};

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as ApiResult & {
      isNew?: boolean;
      ticket?: string;
      phone?: string;
      code?: string;
      available?: boolean;
      retryAfter?: number;
      error?: string;
    };
  } catch {
    if (response.status >= 500) {
      throw new FlowError("No pudimos enviar el código. Inténtalo nuevamente.", "REGISTRATION_ERROR");
    }
    throw new FlowError("No pudimos completar el registro. Inténtalo nuevamente.", "REGISTRATION_ERROR");
  }
}

async function postAuth(path: string, body: Record<string, unknown>): Promise<ApiResult & { isNew?: boolean; ticket?: string; phone?: string; code?: string; available?: boolean; retryAfter?: number; whatsappOtp?: boolean }> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu internet e intenta otra vez.");
  }

  const result = await readJson(response);
  if (!result.ok) {
    const code = result.code || "REGISTRATION_ERROR";
    throw new FlowError(result.error || FLOW_COPY[code] || "No pudimos completar el registro. Inténtalo nuevamente.", code, result.retryAfter);
  }
  return result;
}

function envWhatsappOtpEnabled() {
  const raw = String(import.meta.env.VITE_ENABLE_WHATSAPP_OTP ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export async function fetchAuthConfig() {
  try {
    const result = await postAuth("/api/pulse", { action: "auth-config" });
    return { whatsappOtp: Boolean(result.whatsappOtp) };
  } catch {
    return { whatsappOtp: envWhatsappOtpEnabled() };
  }
}

export async function checkAlias(alias: string) {
  return postAuth("/api/pulse", { action: "check-alias", alias });
}

export async function registerWithPin(phone: string, fullName: string, alias: string, pin: string) {
  const result = await postAuth("/api/pulse", { action: "register-account", phone, fullName, alias, pin });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function saveAvatar(avatarId: string) {
  const result = await callRpc<{ ok?: boolean; error?: string }>("pulse_set_avatar", {
    p_token: readSessionToken(),
    p_avatar_id: avatarId,
  });
  if (!result?.ok) throw new Error(result?.error || "No se pudo guardar el avatar.");
}

export async function loginWithPin(phone: string, pin: string) {
  const result = await postAuth("/api/pulse", { action: "login-account", phone, pin });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export function detectCredentialKind(credential: string): "pin" | "password" {
  return /^\d{6}$/.test(credential.trim()) ? "pin" : "password";
}

export function passwordMeetsPolicy(password: string): boolean {
  if (password.length < 8 || password.length > 128) return false;
  return /\p{Lu}/u.test(password) && /\p{Nd}/u.test(password) && /[^\p{L}\p{N}]/u.test(password);
}

export type LoginResolution =
  | { kind: "empty" }
  | { kind: "need-choice" }
  | { kind: "pin"; pin: string }
  | { kind: "password"; password: string };

/** Decide qué credencial usar sin intentar nada en red. Puro y testeable. */
export function resolveLoginAttempt(
  pin: string,
  password: string,
  choice: "pin" | "password" | null,
): LoginResolution {
  const cleanPin = pin.trim();
  const hasPin = /^\d{6}$/.test(cleanPin);
  const hasPassword = password.length > 0;
  if (!hasPin && !hasPassword) return { kind: "empty" };
  if (hasPin && hasPassword && !choice) return { kind: "need-choice" };
  if (hasPassword && (!hasPin || choice === "password")) {
    return { kind: "password", password };
  }
  return { kind: "pin", pin: cleanPin };
}

export async function registerWithPassword(phone: string, fullName: string, alias: string, pin: string, password: string) {
  const result = await postAuth("/api/pulse", { action: "register-account-password", phone, fullName, alias, pin, password });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function registerPasswordOnly(phone: string, fullName: string, alias: string, password: string) {
  const result = await postAuth("/api/pulse", { action: "register-account-password-only", phone, fullName, alias, password });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function loginWithPassword(phone: string, password: string) {
  const result = await postAuth("/api/pulse", { action: "login-account-password", phone, credential: password, method: "password" });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function setPassword(current: string, next: string) {
  const result = await postAuth("/api/pulse", {
    action: "set-password",
    token: readSessionToken(),
    current,
    next,
  });
  if (!result.ok) {
    const code = result.code || "REGISTRATION_ERROR";
    throw new FlowError(result.error || FLOW_COPY[code] || "No se pudo guardar la contraseña.", code);
  }
  return true;
}

export async function loginSmart(phone: string, credential: string) {
  const trimmed = credential.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return loginWithPin(phone, trimmed);
  }
  const result = await postAuth("/api/pulse", { action: "login-account-password", phone, credential: trimmed, method: "password" });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function logoutAccount(token: string) {
  if (!token) return;
  try {
    await postAuth("/api/pulse", { action: "logout-account", token });
  } catch {
    /* local session is already cleared */
  }
}

export async function directEnterAccount(phone: string, fullName: string, alias: string) {
  const result = await postAuth("/api/pulse", { action: "direct-enter", phone, fullName, alias });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
}

export async function requestOtp(phone: string) {
  return postAuth("/api/pulse", { action: "send-otp", phone });
}

export async function confirmOtp(phone: string, code: string) {
  const result = await postAuth("/api/pulse", { action: "verify-otp", phone, code });
  if (result.isNew) {
    return { isNew: true as const, ticket: String(result.ticket ?? ""), phone: String(result.phone ?? phone) };
  }
  const token = result.token ?? "";
  writeSessionToken(token);
  return { isNew: false as const, snapshot: asSnapshot(result, token) };
}

export async function finishSignup(ticket: string, alias: string, city: string) {
  const result = await postAuth("/api/pulse", { action: "complete-profile", ticket, alias, city });
  const token = result.token ?? "";
  writeSessionToken(token);
  return asSnapshot(result, token);
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
    const decision = decideSession({
      hasToken: true,
      ok: Boolean(result.ok),
      hasUser: Boolean(result.currentUser),
    });
    if (decision.clearToken) writeSessionToken("");
    if (decision.status !== "ready") return null;
    return asSnapshot(result, token);
  } catch {
    const decision = decideSession({ hasToken: true, networkError: true });
    if (decision.clearToken) writeSessionToken("");
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
