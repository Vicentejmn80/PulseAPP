import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://ovgwqeoslaitsmhdkxbl.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

export interface OtpJson {
  ok: boolean;
  error?: string;
  phone?: string;
  isNew?: boolean;
  ticket?: string;
  token?: string;
  currentUser?: unknown;
  users?: unknown;
  participations?: unknown;
  transactions?: unknown;
  completedMissionIds?: unknown;
  predictionPicks?: unknown;
  extraGames?: unknown;
}

function supabase() {
  if (!SUPABASE_ANON_KEY) throw new Error("Falta la clave de Supabase en el servidor.");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function otpSecret() {
  return (process.env.PULSE_OTP_SECRET || "").trim();
}

function twilioSid() {
  return (process.env.TWILIO_ACCOUNT_SID || "").trim();
}

function twilioToken() {
  return (process.env.TWILIO_AUTH_TOKEN || "").trim();
}

function twilioFrom() {
  const raw = (process.env.TWILIO_WHATSAPP_NUMBER || "+17372508034").trim();
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

export function normalizePhoneClient(raw: string) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return normalizePhoneClient(digits.slice(2));
  if (digits.length === 11 && digits.startsWith("0")) return `+58${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("4")) return `+58${digits}`;
  if (digits.startsWith("58") && digits.length === 12) return `+${digits}`;
  if (/^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return "";
}

function sixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function rpc<T extends OtpJson>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? { ok: false, error: "Sin respuesta del servidor." }) as T;
}

async function sendWhatsAppCode(phone: string, code: string) {
  const sid = twilioSid();
  const token = twilioToken();
  if (!sid || !token) {
    throw new Error("Twilio no está configurado en el servidor.");
  }

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${phone}`);
  params.set("From", twilioFrom());

  const contentSid = (process.env.TWILIO_CONTENT_SID || "").trim();
  if (contentSid) {
    params.set("ContentSid", contentSid);
    params.set("ContentVariables", JSON.stringify({ "1": code }));
  } else {
    params.set(
      "Body",
      `Tu código Pulse es ${code}. Válido por 10 minutos. No lo compartas.`,
    );
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    sid?: string;
    status?: string;
    error_code?: number;
    error_message?: string;
    message?: string;
    code?: number;
  };

  if (!response.ok) {
    const twilioCode = payload.code ?? payload.error_code;
    if (twilioCode === 63016 || twilioCode === 63007) {
      throw new Error(
        "WhatsApp no pudo entregar el código. Abre WhatsApp, escribe join al +1 737 250 8034 (sandbox de Twilio) y vuelve a intentarlo.",
      );
    }
    throw new Error(payload.error_message || payload.message || "Twilio no pudo enviar el WhatsApp.");
  }

  return payload;
}

export async function sendOtp(body: Record<string, unknown>): Promise<OtpJson> {
  const secret = otpSecret();
  if (!secret) return { ok: false, error: "Falta PULSE_OTP_SECRET en el servidor." };

  const phone = String(body.phone ?? "");
  const code = sixDigitCode();
  const issued = await rpc("pulse_otp_issue", {
    p_phone: phone,
    p_code: code,
    p_secret: secret,
  });
  if (!issued.ok) return issued;

  try {
    await sendWhatsAppCode(String(issued.phone), code);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo enviar el WhatsApp." };
  }

  return { ok: true, phone: issued.phone, isNew: Boolean(issued.isNew) };
}

export async function verifyOtp(body: Record<string, unknown>): Promise<OtpJson> {
  const phone = String(body.phone ?? "");
  const code = String(body.code ?? "").replace(/\D/g, "");
  return rpc("pulse_otp_consume", { p_phone: phone, p_code: code });
}

export async function completeOtpProfile(body: Record<string, unknown>): Promise<OtpJson> {
  return rpc("pulse_otp_finish", {
    p_ticket: String(body.ticket ?? ""),
    p_alias: String(body.alias ?? ""),
    p_city: String(body.city ?? ""),
  });
}

export async function handleOtpAction(action: "send-otp" | "verify-otp" | "complete-profile", body: Record<string, unknown>) {
  if (action === "send-otp") return sendOtp(body);
  if (action === "verify-otp") return verifyOtp(body);
  return completeOtpProfile(body);
}
