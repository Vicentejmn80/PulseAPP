import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/* ============================================================================
 * /api/admin  — proxy seguro hacia las RPC pulse_admin_* de Supabase
 *
 * Variables de entorno requeridas (SIN prefijo VITE_, nunca van al frontend):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Opcional:
 *   ALLOWED_ORIGINS   lista separada por comas (ej: https://app.tudominio.com)
 *                     Si no se define, solo se acepta el mismo host (same-origin).
 * ========================================================================== */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const IS_PROD = process.env.VERCEL_ENV === "production";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ----------------------------- Allowlist ---------------------------------- */
// acción → params permitidos. Se usa Map para evitar claves heredadas del
// prototipo ("constructor", "toString", "__proto__", ...).
const ADMIN_ACTIONS = new Map<string, readonly string[]>(
  Object.entries({
    // matchesApi
    pulse_admin_create_match: ["p_home", "p_away", "p_starts_at"],
    pulse_admin_set_result: ["p_match_id", "p_home_score", "p_away_score"],
    pulse_admin_preview_result: ["p_match_id", "p_home_score", "p_away_score"],
    pulse_admin_postpone: ["p_match_id", "p_starts_at"],
    pulse_admin_cancel: ["p_match_id"],
    pulse_admin_save_venue: ["p_name", "p_zone", "p_address", "p_contact", "p_founder"],
    pulse_admin_close_round: ["p_cycle"],
    pulse_admin_create_cycle: ["p_id", "p_name", "p_starts_on", "p_ends_on"],
    pulse_admin_prizes: [],
    pulse_admin_simulate_round_close: [],
    pulse_admin_undo_round_close: [],
    pulse_admin_redeem: ["p_code", "p_venue_id"],
    pulse_admin_challenge_templates: [],
    pulse_admin_set_challenge_template: ["p_code", "p_active", "p_title"],
    // mechanicsApi / demoApi
    pulse_admin_venues: [],
    pulse_admin_rotate_qr: ["p_venue_id"],
    pulse_admin_set_broadcasts: ["p_venue_id", "p_broadcasts"],
    pulse_admin_live_create: ["p_match_id", "p_kind", "p_inning", "p_prompt", "p_labels", "p_closes_at"],
    pulse_admin_live_close: ["p_question"],
    pulse_admin_live_resolve: ["p_question", "p_option"],
    pulse_admin_live_void: ["p_question"],
    pulse_admin_live_list: [],
    pulse_admin_bingo_close: ["p_match", "p_occurred"],
    pulse_admin_flash_create: ["p_venue", "p_prompt", "p_labels", "p_minutes"],
    pulse_admin_flash_resolve: ["p_question", "p_option"],
    pulse_admin_flash_void: ["p_question"],
    pulse_admin_flash_list: [],
    pulse_admin_mechanics_summary: [],
    pulse_admin_save_venue_details: ["p_venue_id", "p_zone", "p_address", "p_instagram", "p_whatsapp", "p_prize"],
    pulse_admin_live_activate: ["p_question"],
    pulse_admin_flash_activate: ["p_question"],
    pulse_admin_upsert_tasca: [
      "p_id", "p_name", "p_slug", "p_zone", "p_city", "p_address", "p_contact",
      "p_description", "p_sponsor", "p_prize", "p_prize_detail", "p_quantity",
      "p_terms", "p_starts", "p_ends", "p_logo", "p_image", "p_active", "p_cycle", "p_regen",
    ],
    // liveApi
    pulse_admin_open_live: ["p_match"],
    pulse_admin_add_event: ["p_match", "p_inning", "p_half", "p_type", "p_description", "p_home", "p_away"],
    pulse_admin_sim_start: ["p_interval"],
    pulse_admin_sim_stop: [],
    pulse_admin_sim_status: [],
    // reporter
    pulse_reporter_state: ["p_match"],
    pulse_reporter_tap: ["p_match", "p_action"],
    pulse_reporter_finish: ["p_match"],
    // liveApi (featured)
    pulse_admin_feature_live: ["p_match"],
    pulse_admin_unfeature: ["p_match"],
    pulse_admin_set_inning_kind: ["p_kind"],
    // simulationApi
    pulse_admin_sim_preview: ["p_scenario"],
    // leaguesApi
    pulse_admin_league_list: [],
    // triviaApi
    pulse_trivia_admin_list: [],
    pulse_trivia_admin_save: [
      "p_id", "p_prompt", "p_options", "p_correct_option", "p_explanation",
      "p_category", "p_difficulty", "p_status", "p_publish_date", "p_points",
    ],
    pulse_trivia_admin_set_status: ["p_question_id", "p_status"],
    pulse_admin_overview: [],
    pulse_admin_users: ["p_query", "p_limit", "p_offset", "p_status", "p_sort"],
    pulse_admin_user_ledger: ["p_user_id", "p_limit"],
    pulse_admin_match_board: ["p_status", "p_team", "p_from", "p_to", "p_limit", "p_offset"],
    pulse_admin_ledger: ["p_type", "p_limit", "p_offset"],
    pulse_admin_audit_recent: ["p_limit"],
    pulse_admin_adjust_points: ["p_user_id", "p_points", "p_reason", "p_request_id"],
    pulse_admin_set_suspension: ["p_user_id", "p_suspend", "p_reason"],
    pulse_admin_team: [],
    pulse_admin_grant: ["p_handle", "p_reason", "p_role"],
    pulse_admin_revoke: ["p_handle", "p_reason"],
    pulse_admin_top_predictors: [],
    pulse_admin_whoami: [],
    pulse_admin_save_ally: ["p_venue_id", "p_name", "p_zone", "p_city", "p_active"],
    pulse_admin_save_campaign: ["p_campaign_id", "p_venue_id", "p_name", "p_points", "p_active"],
    pulse_admin_allies: [],
  })
);

// Acciones que un rol "reporter" sí puede ejecutar (si pulse_admin_check devuelve rol).
const isReporterAction = (action: string) => action.startsWith("pulse_reporter_");

// Un operador solo liquida resultados y consulta usuarios. El resto lo rechaza el servidor.
const OPERATOR_ACTIONS = new Set([
  "pulse_admin_users",
  "pulse_admin_user_ledger",
  "pulse_admin_match_board",
  "pulse_admin_preview_result",
  "pulse_admin_set_result",
  "pulse_admin_whoami",
]);

// Acciones destructivas / de alto impacto: se audita ANTES de ejecutar y,
// si la auditoría falla, la acción se aborta (fail-closed).
const DESTRUCTIVE_ACTIONS = new Set([
  "pulse_admin_cancel",
  "pulse_admin_set_result",
  "pulse_admin_postpone",
  "pulse_admin_close_round",
  "pulse_admin_create_cycle",
  "pulse_admin_undo_round_close",
  "pulse_admin_simulate_round_close",
  "pulse_admin_redeem",
  "pulse_admin_rotate_qr",
  "pulse_admin_live_resolve",
  "pulse_admin_live_void",
  "pulse_admin_flash_resolve",
  "pulse_admin_flash_void",
  "pulse_admin_bingo_close",
  "pulse_admin_sim_start",
  "pulse_admin_adjust_points",
  "pulse_admin_set_suspension",
  "pulse_admin_grant",
  "pulse_admin_revoke",
  "pulse_admin_save_ally",
  "pulse_admin_save_campaign",
]);

/* ----------------------------- Límites ------------------------------------ */
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PARAMS_BYTES = 32_000;
const MAX_STRING_LEN = 10_000;
const MAX_ARRAY_LEN = 200;
const MAX_OBJECT_KEYS = 100;
const MAX_DEPTH = 5;
const TOKEN_RE = /^sess_[A-Za-z0-9._-]{8,256}$/;

// Rate limit en memoria (por instancia serverless; ver nota al final).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120; // por IP por minuto
const FAIL_WINDOW_MS = 10 * 60_000;
const FAIL_MAX = 10; // fallos de auth por IP en 10 min

/* ----------------------------- Utilidades --------------------------------- */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function touch(key: string, windowMs: number): Bucket {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  return b;
}

function clientIp(req: VercelRequest): string {
  const h = (name: string) => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const raw = h("x-vercel-forwarded-for") ?? h("x-real-ip") ?? h("x-forwarded-for") ?? "";
  return raw.split(",")[0].trim().slice(0, 64) || "unknown";
}

function setSecurityHeaders(res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function fail(res: VercelResponse, status: number, error: string) {
  res.status(status).json({ ok: false, error });
}

function originAllowed(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // clientes no-navegador: igual necesitan token válido
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOWED_ORIGINS.length === 0) {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
  return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Valida que un valor sea JSON "seguro": tipos primitivos, arrays y objetos
// planos con límites de tamaño y profundidad. Lanza si algo no cuadra.
function checkValue(v: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) throw new Error("depth");
  if (v === null || typeof v === "boolean") return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("number");
    return;
  }
  if (typeof v === "string") {
    if (v.length > MAX_STRING_LEN) throw new Error("string");
    return;
  }
  if (Array.isArray(v)) {
    if (v.length > MAX_ARRAY_LEN) throw new Error("array");
    for (const item of v) checkValue(item, depth + 1);
    return;
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length > MAX_OBJECT_KEYS) throw new Error("object");
    for (const k of keys) {
      if (FORBIDDEN_KEYS.has(k) || k.length > 64) throw new Error("key");
      checkValue(v[k], depth + 1);
    }
    return;
  }
  throw new Error("type");
}

function serverSupabase() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Config incompleta: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// pulse_admin_check puede devolver un id (string) o un objeto { user_id, role }.
function parseCheck(data: unknown): { userId: string; role: string } | null {
  if (typeof data === "string" || typeof data === "number") {
    return { userId: String(data), role: "admin" };
  }
  if (isPlainObject(data)) {
    const id = data.user_id ?? data.userId ?? data.id;
    if (typeof id === "string" || typeof id === "number") {
      return { userId: String(id), role: typeof data.role === "string" ? data.role : "admin" };
    }
  }
  return null;
}

async function auditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entry: {
    userId: string;
    action: string;
    target: string;
    ok: boolean;
    phase: "attempt" | "result";
    error?: string;
    ip: string;
    ua: string;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase.from("pulse_admin_audit").insert({
      user_id: entry.userId,
      action: entry.action,
      target: entry.target.slice(0, 200),
      ok: entry.ok,
      details: {
        phase: entry.phase,
        ip: entry.ip,
        ua: entry.ua,
        ...(entry.error ? { error: entry.error.slice(0, 500) } : {}),
      },
    });
    if (error) {
      console.error("[admin] audit insert error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[admin] audit exception:", err instanceof Error ? err.message : err);
    return false;
  }
}

/* ------------------------------- Handler ---------------------------------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Método no permitido.");
  }

  // Content-Type
  const ctype = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return fail(res, 415, "Tipo de contenido no soportado.");
  }

  // Origin / CSRF
  if (!originAllowed(req)) {
    return fail(res, 403, "Origen no permitido.");
  }

  // Rate limit
  const ip = clientIp(req);
  const ua = String(req.headers["user-agent"] ?? "").slice(0, 200);

  const failBucket = touch(`fail:${ip}`, FAIL_WINDOW_MS);
  if (failBucket.count >= FAIL_MAX) {
    res.setHeader("Retry-After", String(Math.ceil((failBucket.resetAt - Date.now()) / 1000)));
    return fail(res, 429, "Demasiados intentos. Intenta más tarde.");
  }
  const rateBucket = touch(`rate:${ip}`, RATE_WINDOW_MS);
  rateBucket.count += 1;
  if (rateBucket.count > RATE_MAX_REQUESTS) {
    res.setHeader("Retry-After", String(Math.ceil((rateBucket.resetAt - Date.now()) / 1000)));
    return fail(res, 429, "Demasiadas solicitudes.");
  }

  // Tamaño (header declarado)
  const declared = Number(req.headers["content-length"] ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail(res, 413, "Cuerpo demasiado grande.");
  }

  // Body: debe ser un objeto plano. Vercel ya lo parsea; si llega string, se intenta parsear.
  let body: unknown = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY_BYTES) return fail(res, 413, "Cuerpo demasiado grande.");
    try {
      body = JSON.parse(body);
    } catch {
      return fail(res, 400, "Cuerpo inválido.");
    }
  }
  if (!isPlainObject(body)) {
    return fail(res, 400, "Cuerpo inválido.");
  }

  const action = typeof body.action === "string" ? body.action : "";
  const token = typeof body.token === "string" ? body.token : "";

  // Cliente Supabase (falla cerrado si falta configuración)
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any;
try {
  supabase = serverSupabase();
  } catch (err) {
    console.error("[admin]", err instanceof Error ? err.message : err);
    return fail(res, 500, "Servicio no disponible.");
  }

  // Formato de token (antes de tocar la base de datos)
  const denyAuth = () => {
    failBucket.count += 1;
    console.warn(`[admin] auth fallida ip=${ip} action=${action.slice(0, 64)}`);
    return fail(res, 403, "Sin permiso.");
  };
  if (!TOKEN_RE.test(token)) return denyAuth();

  // Validar sesión
  let session: { userId: string; role: string } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("pulse_admin_check", { p_token: token });
    if (error || !data) return denyAuth();
    session = parseCheck(data);
  } catch {
    return denyAuth();
  }
  if (!session) return denyAuth();

  let seatRole = "super";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const who = await (supabase as any).rpc("pulse_admin_whoami", { p_admin_key: token });
    const role = who?.data && typeof who.data === "object" ? String((who.data as { role?: string }).role || "") : "";
    if (!who?.error && role === "operator") {
      session.role = "operator";
      seatRole = "operator";
    } else if (!who?.error && role === "super") {
      seatRole = "super";
    }
  } catch {
    seatRole = "super";
  }

  // whoami
  if (action === "admin-whoami") {
    return void res.status(200).json({ ok: true, userId: session.userId, role: seatRole });
  }

  if (session.role === "operator" && !OPERATOR_ACTIONS.has(action)) {
    console.warn(`[admin] rol insuficiente user=${session.userId} action=${action}`);
    return fail(res, 403, "Sin permiso.");
  }

  // Allowlist de acciones
  if (!ADMIN_ACTIONS.has(action)) {
    return fail(res, 400, "Acción inválida.");
  }
  const allowedParams = ADMIN_ACTIONS.get(action) as readonly string[];

  // Autorización por rol: un reporter solo puede ejecutar pulse_reporter_*
  if (session.role === "reporter" && !isReporterAction(action)) {
    console.warn(`[admin] rol insuficiente user=${session.userId} action=${action}`);
    return fail(res, 403, "Sin permiso.");
  }

  // Params: solo los permitidos, con tipos y tamaños validados
  const rawParams = isPlainObject(body.params) ? body.params : {};
  const params: Record<string, unknown> = {};
  try {
    for (const key of allowedParams) {
      if (Object.prototype.hasOwnProperty.call(rawParams, key) && rawParams[key] !== undefined) {
        checkValue(rawParams[key]);
        params[key] = rawParams[key];
      }
    }
    if (JSON.stringify(params).length > MAX_PARAMS_BYTES) throw new Error("size");
  } catch {
    return fail(res, 400, "Parámetros inválidos.");
  }

  // Credenciales inyectadas por el servidor (el cliente no puede fijarlas:
  // p_admin_key y p_token no están en ninguna lista de params permitidos).
  params.p_admin_key = token;
  if (action === "pulse_admin_sim_start") params.p_token = token;

  // Target para auditoría
  const target = String(
    [
      params.p_match, params.p_match_id, params.p_venue, params.p_venue_id,
      params.p_question, params.p_question_id, params.p_cycle, params.p_code,
      params.p_slug, params.p_id, params.p_scenario,
    ].find((v) => typeof v === "string" || typeof v === "number") ?? ""
  );

  const audit = (ok: boolean, phase: "attempt" | "result", error?: string) =>
    auditLog(supabase, { userId: session!.userId, action, target, ok, phase, error, ip, ua });

  // Acciones destructivas: auditar el intento ANTES; si no se puede, no se ejecuta.
  if (DESTRUCTIVE_ACTIONS.has(action)) {
    const logged = await audit(true, "attempt");
    if (!logged) return fail(res, 500, "Servicio no disponible.");
  }

  // Ejecutar RPC
  let result: unknown;
  let ok = false;
  let errorMsg = "";
  try {
    const { data, error } = await (supabase as any).rpc(action, params);
    if (error) {
      errorMsg = error.message;
    } else {
      ok = true;
      result = data;
    }
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : "Error interno.";
  }

  // Auditoría del resultado
  await audit(ok, "result", ok ? undefined : errorMsg);

  if (!ok) {
    console.error(`[admin] rpc ${action} falló: ${errorMsg}`);
    return fail(res, 400, IS_PROD ? "No se pudo completar." : errorMsg || "No se pudo completar.");
  }

  res.status(200).json(result ?? null);
}

/* ----------------------------------------------------------------------------
 * NOTAS
 * 1) El rate limit es en memoria: cada instancia serverless tiene su propio
 *    contador, así que es una barrera básica, no absoluta. Para algo robusto
 *    usa Upstash Redis / Vercel KV o el Firewall de Vercel (WAF rate limiting).
 * 2) Lo más importante vive FUERA de este archivo: en Postgres, haz
 *      REVOKE EXECUTE ON FUNCTION pulse_admin_* FROM PUBLIC, anon, authenticated;
 *      GRANT  EXECUTE ON FUNCTION pulse_admin_* TO service_role;
 *    y que pulse_admin_check valide sesión con expiración y revocación.
 * 3) Si pulse_admin_check devuelve un objeto con { user_id, role }, el rol
 *    "reporter" quedará limitado a pulse_reporter_*.
 * ------------------------------------------------------------------------- */