import { serverSupabase } from "./supabaseServer.mjs";
import { normalizePhone, validateAlias } from "./otpAuth.mjs";

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

async function rpc(fn, args) {
  let client;
  try {
    client = serverSupabase();
  } catch {
    console.info(JSON.stringify({ event: "pin_auth_error", fn, reason: "config" }));
    return { ok: false, code: "REGISTRATION_ERROR", error: "No pudimos completar el acceso. Inténtalo nuevamente." };
  }
  const { data, error } = await client.rpc(fn, args);
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

const MAX_PASSWORD_LENGTH = 128;

export function validatePasswordFormat(raw) {
  const password = String(raw ?? "");
  if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, code: "INVALID_PASSWORD", error: "La contraseña necesita 8+ caracteres, 1 mayúscula, 1 número y 1 símbolo." };
  }
  if (!/\p{Lu}/u.test(password) || !/\p{Nd}/u.test(password) || !/[^\p{L}\p{N}]/u.test(password)) {
    return { ok: false, code: "INVALID_PASSWORD", error: "La contraseña necesita 8+ caracteres, 1 mayúscula, 1 número y 1 símbolo." };
  }
  return { ok: true, password };
}

export function detectAuthMethod(credential) {
  return /^\d{6}$/.test(String(credential ?? "").trim()) ? "pin" : "password";
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

export async function registerWithPassword(body) {
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, code: "INVALID_PHONE", error: "Revisa el número de teléfono." };
  const name = validateFullName(body.fullName);
  if (!name.ok) return name;
  const alias = validateAlias(body.alias);
  if (!alias.ok) return alias;
  const pin = validatePin(body.pin);
  if (!pin.ok) return pin;
  const password = validatePasswordFormat(body.password);
  if (!password.ok) return password;
  console.info(JSON.stringify({ event: "account_register_password_requested" }));
  return rpc("pulse_account_register_password", {
    p_phone: phone,
    p_full_name: name.fullName,
    p_alias: alias.alias,
    p_pin: pin.pin,
    p_password: password.password,
  });
}

export async function loginWithPassword(body) {
  const phone = normalizePhone(body.phone);
  const credential = String(body.credential ?? "");
  const method = String(body.method ?? "auto").trim().toLowerCase();
  if (!phone || !credential || credential.length > 256) {
    return { ok: false, code: "AUTH_INVALID", error: "No pudimos validar tus credenciales." };
  }
  if (method !== "pin" && method !== "password" && method !== "auto") {
    return { ok: false, code: "AUTH_INVALID", error: "No pudimos validar tus credenciales." };
  }
  // Un PIN de una cuenta ya creada se valida en pulse_account_login.
  // Ese camino no usa tickets OTP ni pulse_otp_finish.
  if (method === "pin" || (method === "auto" && /^\d{6}$/.test(credential.trim()))) {
    return loginWithPin({ phone: body.phone, pin: credential.trim() });
  }
  console.info(JSON.stringify({ event: "account_login_password_requested" }));
  return rpc("pulse_account_login_password", {
    p_phone: phone,
    p_credential: credential,
    p_method: method,
  });
}

export async function handlePasswordAction(action, body) {
  if (action === "register-account-password") return registerWithPassword(body || {});
  if (action === "login-account-password") return loginWithPassword(body || {});
  return { ok: false, code: "REGISTRATION_ERROR", error: "Acción no reconocida." };
}
