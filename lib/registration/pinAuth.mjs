import { createClient } from "@supabase/supabase-js";
import { normalizePhone, validateAlias } from "./otpAuth.mjs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://ovgwqeoslaitsmhdkxbl.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

const WEAK_PINS = new Set([
  "000000",
  "111111",
  "222222",
  "333333",
  "444444",
  "555555",
  "666666",
  "777777",
  "888888",
  "999999",
  "123456",
  "654321",
  "121212",
]);

function supabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(fn, args) {
  if (!SUPABASE_ANON_KEY) {
    return { ok: false, code: "REGISTRATION_ERROR", error: "Falta SUPABASE_ANON_KEY o VITE_SUPABASE_ANON_KEY" };
  }
  const { data, error } = await supabase().rpc(fn, args);
  if (error) {
    console.info(JSON.stringify({ event: "pin_auth_error", fn }));
    return { ok: false, code: "REGISTRATION_ERROR", error: "No pudimos completar el acceso. Inténtalo nuevamente." };
  }
  return data ?? { ok: false, code: "REGISTRATION_ERROR", error: "Sin respuesta del servidor." };
}

export function validatePin(raw) {
  const pin = String(raw ?? "").trim();
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, code: "INVALID_PIN", error: "El PIN debe tener 6 números." };
  }
  if (WEAK_PINS.has(pin)) {
    return { ok: false, code: "INVALID_PIN", error: "Elige un PIN menos obvio." };
  }
  return { ok: true, pin };
}

export function validateFullName(raw) {
  const fullName = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 80) {
    return { ok: false, code: "INVALID_FULL_NAME", error: "Escribe tu nombre completo." };
  }
  return { ok: true, fullName };
}

export function uniqueViolationCode(constraint) {
  const name = String(constraint ?? "");
  if (name.includes("phone")) return "PHONE_ALREADY_REGISTERED";
  return "ALIAS_ALREADY_TAKEN";
}

export async function registerWithPin(body) {
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, code: "INVALID_PHONE", error: "Revisa el número de teléfono." };
  const name = validateFullName(body.fullName);
  if (!name.ok) return name;
  const alias = validateAlias(body.alias);
  if (!alias.ok) return alias;
  const pin = validatePin(body.pin);
  if (!pin.ok) return pin;
  console.info(JSON.stringify({ event: "account_register_requested" }));
  return rpc("pulse_account_register", {
    p_phone: phone,
    p_full_name: name.fullName,
    p_alias: alias.alias,
    p_pin: pin.pin,
  });
}

export async function loginWithPin(body) {
  const phone = normalizePhone(body.phone);
  const pin = String(body.pin ?? "").trim();
  if (!phone || !/^\d{6}$/.test(pin)) {
    return { ok: false, code: "PIN_INVALID", error: "El número o PIN no son correctos." };
  }
  console.info(JSON.stringify({ event: "account_login_requested" }));
  return rpc("pulse_account_login", { p_phone: phone, p_pin: pin });
}

export async function logoutSession(body) {
  const token = String(body.token ?? "").trim();
  if (!token) return { ok: true, code: "LOGGED_OUT" };
  return rpc("pulse_logout", { p_token: token });
}

export async function handlePinAction(action, body) {
  if (action === "register-account") return registerWithPin(body || {});
  if (action === "login-account") return loginWithPin(body || {});
  if (action === "logout-account") return logoutSession(body || {});
  return { ok: false, code: "REGISTRATION_ERROR", error: "Acción no reconocida." };
}
