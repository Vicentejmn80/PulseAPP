import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://ovgwqeoslaitsmhdkxbl.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Z3dxZW9zbGFpdHNtaGRreGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDA3NDcsImV4cCI6MjEwNTc3Njc0N30.T6e7hMV-BkuI_RJtRm2qMax5n7DmbTJpNYLVGpO-Vd8";

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
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function otpSecret() {
  return (process.env.PULSE_OTP_SECRET || "ffb1e5c6545e0b0394eee83520a90e3afbfba63821ecf9e6").trim();
}

function basicAuth(sid: string, token: string) {
  const raw = `${sid}:${token}`;
  if (typeof Buffer !== "undefined") return Buffer.from(raw).toString("base64");
  return btoa(raw);
}

function asWhatsAppFrom(raw: string) {
  const value = raw.trim();
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
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

async function twilioCredentials() {
  const envSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const envToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const envFrom = (process.env.TWILIO_WHATSAPP_NUMBER || "").trim();
  const envContent = (process.env.TWILIO_CONTENT_SID || "").trim();
  if (envSid && envToken) {
    return {
      accountSid: envSid,
      authToken: envToken,
      whatsappNumber: envFrom || "+17372508034",
      contentSid: envContent,
    };
  }

  const secret = otpSecret();
  if (!secret) return null;
  const remote = await rpc<OtpJson & {
    accountSid?: string;
    authToken?: string;
    whatsappNumber?: string;
    contentSid?: string;
  }>("pulse_otp_provider", { p_secret: secret });
  if (!remote.ok || !remote.accountSid || !remote.authToken) return null;
  return {
    accountSid: String(remote.accountSid),
    authToken: String(remote.authToken),
    whatsappNumber: String(remote.whatsappNumber || "+17372508034"),
    contentSid: String(remote.contentSid || ""),
  };
}

async function sendWhatsAppCode(phone: string, code: string) {
  const creds = await twilioCredentials();
  if (!creds) {
    throw new Error("Twilio no está configurado. Revisa las variables del servidor.");
  }

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${phone}`);
  params.set("From", asWhatsAppFrom(creds.whatsappNumber));
  if (creds.contentSid) {
    params.set("ContentSid", creds.contentSid);
    params.set("ContentVariables", JSON.stringify({ "1": code }));
  } else {
    params.set("Body", `Tu código Pulse es ${code}. Válido por 10 minutos. No lo compartas.`);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(creds.accountSid, creds.authToken)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    error_code?: number;
    error_message?: string;
    message?: string;
    code?: number;
  };

  if (!response.ok) {
    const twilioCode = payload.code ?? payload.error_code;
    if (twilioCode === 63016 || twilioCode === 63007 || twilioCode === 21211) {
      throw new Error(
        "WhatsApp no pudo entregar el código. Abre WhatsApp, escribe el join del sandbox al +1 737 250 8034 y vuelve a pedirlo.",
      );
    }
    throw new Error(payload.error_message || payload.message || "Twilio no pudo enviar el WhatsApp.");
  }
}

export async function sendOtp(body: Record<string, unknown>): Promise<OtpJson> {
  const secret = otpSecret();
  if (!secret) return { ok: false, error: "Falta PULSE_OTP_SECRET en el servidor de Vercel." };

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

export async function handleOtpAction(
  action: "send-otp" | "verify-otp" | "complete-profile",
  body: Record<string, unknown>,
) {
  if (action === "send-otp") return sendOtp(body);
  if (action === "verify-otp") return verifyOtp(body);
  return completeOtpProfile(body);
}
