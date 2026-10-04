import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleOtpAction } from "../lib/registration/otpAuth.mjs";
import { handlePinAction } from "../lib/registration/pinAuth.mjs";

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (body ?? {}) as Record<string, unknown>;
}

function fail(res: VercelResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "No pudimos completar el registro. Inténtalo nuevamente.";
  res.status(500).json({ ok: false, code: "REGISTRATION_ERROR", error: message });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, code: "REGISTRATION_ERROR", error: "Método no permitido." });
    return;
  }

  const body = readBody(req);
  const action = String(body.action ?? "");

  if (action === "register-account" || action === "login-account" || action === "logout-account") {
    try {
      const result = await handlePinAction(action, body);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      fail(res, error);
    }
    return;
  }

  if (
    action === "auth-config" ||
    action === "direct-enter" ||
    action === "send-otp" ||
    action === "verify-otp" ||
    action === "check-alias" ||
    action === "complete-profile"
  ) {
    try {
      console.info(JSON.stringify({ event: "registration_started", action }));
      const result = await handleOtpAction(action, body);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      fail(res, error);
    }
    return;
  }

  try {
    const { handlePulse } = await import("../src/server/engine");
    const result = await handlePulse(body);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    fail(res, error);
  }
}
