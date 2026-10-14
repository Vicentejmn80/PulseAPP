import { createClient } from "@supabase/supabase-js";
import { normalizePhone, sendWhatsAppCodeFromEnv } from "./otpAuth.mjs";
import { validatePin } from "./pinAuth.mjs";

const PUBLIC_START = { ok: true, code: "RECOVERY_STARTED" };
const PUBLIC_FAIL = { ok: false, code: "RECOVERY_FAILED", error: "No pudimos verificar el código." };

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function serviceRpc(fn, args) {
  const client = serviceClient();
  if (!client) return { ok: false, deliver: false };
  const { data, error } = await client.rpc(fn, args);
  if (error || !data) return { ok: false, deliver: false };
  return data;
}

export function createFakePinDelivery() {
  const sent = [];
  return {
    sent,
    async send(phone) {
      sent.push({ phone, at: Date.now() });
      return { ok: true };
    },
  };
}

export async function startPinRecovery(body, deps = {}) {
  const phone = normalizePhone(body?.phone);
  const rpc = deps.rpc || serviceRpc;
  const deliver = deps.deliver || sendWhatsAppCodeFromEnv;
  if (phone) {
    try {
      const internal = await rpc("pulse_pin_recovery_start", { p_phone: phone });
      if (internal && internal.deliver === true && internal.otp && internal.phone) {
        try {
          await deliver(internal.phone, internal.otp);
        } catch {
          /* The public response stays the same when delivery fails. */
        }
      }
    } catch {
      /* Uniform response. Do not surface driver errors. */
    }
  }
  return PUBLIC_START;
}

export async function confirmPinRecovery(body, deps = {}) {
  const phone = normalizePhone(body?.phone);
  const pin = validatePin(body?.pin);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!phone || !pin.ok || !/^\d{6}$/.test(code)) return PUBLIC_FAIL;
  const rpc = deps.rpc || serviceRpc;
  try {
    const result = await rpc("pulse_pin_commit", { p_phone: phone, p_code: code, p_pin: pin.pin });
    if (!result || result.ok !== true || !result.currentUser) return PUBLIC_FAIL;
    const { otp: _otp, deliver: _deliver, ...publicResult } = result;
    return publicResult;
  } catch {
    return PUBLIC_FAIL;
  }
}
