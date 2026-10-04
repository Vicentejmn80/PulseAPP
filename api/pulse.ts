import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleOtpAction } from "./_lib/otpAuth";

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
  const message = error instanceof Error ? error.message : "Error del servidor";
  res.status(500).json({ ok: false, error: message });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Método no permitido." });
    return;
  }

  const body = readBody(req);
  const action = String(body.action ?? "");

  if (action === "send-otp" || action === "verify-otp" || action === "complete-profile") {
    try {
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
