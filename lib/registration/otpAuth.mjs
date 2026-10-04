import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://ovgwqeoslaitsmhdkxbl.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Z3dxZW9zbGFpdHNtaGRreGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDA3NDcsImV4cCI6MjEwNTc3Njc0N30.T6e7hMV-BkuI_RJtRm2qMax5n7DmbTJpNYLVGpO-Vd8";

const SANDBOX_FROM = "+17372508034";

function supabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function otpSecret() {
  return (process.env.PULSE_OTP_SECRET || "ffb1e5c6545e0b0394eee83520a90e3afbfba63821ecf9e6").trim();
}

export function whatsappOtpEnabled() {
  const raw = String(process.env.ENABLE_WHATSAPP_OTP ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function log(event, fields = {}) {
  console.info(JSON.stringify({ event, ...fields }));
}

function maskPhone(phone) {
  const value = String(phone || "");
  if (value.length < 6) return "invalid";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("4")) digits = `58${digits}`;
  if (/^58\d{10}$/.test(digits)) return `+${digits}`;
  if (/^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return "";
}

export function aliasKey(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function validateAlias(raw) {
  const key = aliasKey(raw);
  if (!/^[a-z0-9_]{3,20}$/.test(key)) {
    return { ok: false, code: "INVALID_ALIAS", error: "Usa de 3 a 20 letras, números o _. Sin espacios." };
  }
  return { ok: true, alias: String(raw).trim(), key };
}

export function mapTwilioFailure(status, payload = {}) {
  const twilioCode = Number(payload.code ?? payload.error_code ?? 0);
  const text = String(payload.message || payload.error_message || "").toLowerCase();
  if (status === 401 || twilioCode === 20003 || twilioCode === 20008) {
    return { code: "TWILIO_AUTH_ERROR", error: "Hay un problema temporal con el servicio de WhatsApp. Inténtalo nuevamente." };
  }
  if (twilioCode === 21211 || twilioCode === 21214 || twilioCode === 21614) {
    return { code: "TWILIO_INVALID_NUMBER", error: "Revisa el número de teléfono." };
  }
  if (
    twilioCode === 63007 ||
    twilioCode === 63015 ||
    twilioCode === 63016 ||
    twilioCode === 63018 ||
    text.includes("sandbox") ||
    text.includes("joined")
  ) {
    return {
      code: "TWILIO_SANDBOX_NOT_JOINED",
      error: "Este número todavía no está conectado al WhatsApp de Pulse. Envía el mensaje de unión al +1 737 250 8034 y vuelve a intentarlo.",
    };
  }
  if (status === 429 || twilioCode === 20429) {
    return { code: "OTP_RATE_LIMITED", error: "Has solicitado demasiados códigos. Espera unos minutos antes de intentarlo nuevamente." };
  }
  if (twilioCode === 21654 || text.includes("contentsid")) {
    return {
      code: "TWILIO_TEMPLATE_REQUIRED",
      error: "WhatsApp no dejó enviar el código en texto libre. Esta cuenta de Twilio exige una plantilla OTP aprobada (TWILIO_CONTENT_SID).",
    };
  }
  return { code: "TWILIO_ERROR", error: "No pudimos enviar el código. Inténtalo nuevamente." };
}

function basicAuth(sid, token) {
  return Buffer.from(`${sid}:${token}`).toString("base64");
}

function asWhatsAppFrom(raw) {
  const value = String(raw || "").trim();
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

async function rpc(fn, args) {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) {
    log("registration_error", { fn, message: error.message });
    return { ok: false, code: "REGISTRATION_ERROR", error: "No pudimos completar el registro. Inténtalo nuevamente." };
  }
  return data ?? { ok: false, code: "REGISTRATION_ERROR", error: "Sin respuesta del servidor." };
}

async function twilioCredentials() {
  const envSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const envToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const envFrom = (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || "").trim();
  const envContent = (process.env.TWILIO_CONTENT_SID || "").trim();
  if (envSid && envToken) {
    return {
      accountSid: envSid,
      authToken: envToken,
      whatsappNumber: envFrom || SANDBOX_FROM,
      contentSid: envContent,
    };
  }
  const secret = otpSecret();
  if (!secret) return null;
  const remote = await rpc("pulse_otp_provider", { p_secret: secret });
  if (!remote.ok || !remote.accountSid || !remote.authToken) return null;
  return {
    accountSid: String(remote.accountSid),
    authToken: String(remote.authToken),
    whatsappNumber: String(remote.whatsappNumber || SANDBOX_FROM),
    contentSid: String(remote.contentSid || ""),
  };
}

async function sendWhatsAppCode(phone, code) {
  const creds = await twilioCredentials();
  if (!creds) {
    return { ok: false, code: "TWILIO_AUTH_ERROR", error: "Hay un problema temporal con el servicio de WhatsApp. Inténtalo nuevamente." };
  }

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${phone}`);
  params.set("From", asWhatsAppFrom(creds.whatsappNumber));
  const sandbox = creds.whatsappNumber.replace(/\D/g, "").endsWith("17372508034");
  if (creds.contentSid) {
    params.set("ContentSid", creds.contentSid);
    params.set("ContentVariables", JSON.stringify({ "1": code }));
  } else {
    params.set("Body", `Tu código de Pulse es ${code}. Válido por 10 minutos. No lo compartas.`);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(creds.accountSid, creds.authToken)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const mapped = mapTwilioFailure(response.status, payload);
    log("otp_failed", { phone: maskPhone(phone), code: mapped.code, providerStatus: response.status, providerCode: payload.code ?? payload.error_code ?? null });
    return { ok: false, ...mapped, sandbox };
  }
  log("otp_sent", { phone: maskPhone(phone), providerStatus: payload.status || "queued", sandbox });
  return { ok: true, sandbox };
}

export async function sendOtp(body) {
  if (!whatsappOtpEnabled()) {
    return { ok: false, code: "OTP_DISABLED", error: "El login por WhatsApp está desactivado temporalmente." };
  }
  const phone = normalizePhone(body.phone);
  log("otp_requested", { phone: maskPhone(phone || String(body.phone || "")) });
  if (!phone) return { ok: false, code: "INVALID_PHONE", error: "Revisa el número de teléfono." };
  if (!otpSecret()) return { ok: false, code: "TWILIO_AUTH_ERROR", error: "Hay un problema temporal con el servicio de WhatsApp. Inténtalo nuevamente." };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const issued = await rpc("pulse_otp_issue", { p_phone: phone, p_code: code, p_secret: otpSecret() });
  if (!issued.ok) {
    log("otp_failed", { phone: maskPhone(phone), code: issued.code || "OTP_FAILED" });
    return issued;
  }

  const sent = await sendWhatsAppCode(String(issued.phone || phone), code);
  if (!sent.ok) return sent;
  return { ok: true, code: "OTP_SENT", phone: issued.phone, isNew: Boolean(issued.isNew), sandbox: Boolean(sent.sandbox) };
}

export async function verifyOtp(body) {
  if (!whatsappOtpEnabled()) {
    return { ok: false, code: "OTP_DISABLED", error: "El login por WhatsApp está desactivado temporalmente." };
  }
  const phone = normalizePhone(body.phone);
  const code = String(body.code ?? "").replace(/\D/g, "");
  const result = await rpc("pulse_otp_consume", { p_phone: phone, p_code: code });
  log(result.ok ? "otp_verified" : "otp_failed", { phone: maskPhone(phone), code: result.code || (result.ok ? "OTP_VERIFIED" : "OTP_INVALID") });
  return result;
}

export async function checkAlias(body) {
  const verdict = validateAlias(body.alias);
  if (!verdict.ok) return { ok: true, available: false, code: verdict.code, error: verdict.error };
  const result = await rpc("pulse_alias_available", { p_alias: verdict.alias });
  log(result.available ? "alias_check" : "alias_taken", { code: result.code || "ALIAS_CHECK" });
  return result;
}

export async function authConfig() {
  return { ok: true, code: "AUTH_CONFIG", whatsappOtp: whatsappOtpEnabled() };
}

export async function directEnter() {
  return {
    ok: false,
    code: "DIRECT_ENTER_DISABLED",
    error: "Crea tu cuenta con nombre, alias, teléfono y PIN.",
  };
}

export async function completeOtpProfile(body) {
  if (!whatsappOtpEnabled()) {
    return { ok: false, code: "OTP_DISABLED", error: "El login por WhatsApp está desactivado temporalmente." };
  }
  log("profile_create_requested", {});
  const result = await rpc("pulse_otp_finish", {
    p_ticket: String(body.ticket ?? ""),
    p_alias: String(body.alias ?? ""),
    p_city: String(body.city ?? ""),
  });
  log(result.ok ? "profile_created" : "profile_create_failed", { code: result.code || (result.ok ? "PROFILE_CREATED" : "REGISTRATION_ERROR") });
  return result;
}

export async function handleOtpAction(action, body) {
  if (action === "auth-config") return authConfig();
  if (action === "direct-enter") return directEnter(body || {});
  if (action === "send-otp") return sendOtp(body || {});
  if (action === "verify-otp") return verifyOtp(body || {});
  if (action === "check-alias") return checkAlias(body || {});
  if (action === "complete-profile") return completeOtpProfile(body || {});
  return { ok: false, code: "REGISTRATION_ERROR", error: "Acción no reconocida." };
}
