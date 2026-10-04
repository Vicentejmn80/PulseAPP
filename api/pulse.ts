import type { VercelRequest, VercelResponse } from "@vercel/node";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Método no permitido." });
    return;
  }

  try {
    const body = readBody(req);
    const action = String(body.action ?? "");
    if (action === "send-otp" || action === "verify-otp" || action === "complete-profile") {
      const { handleOtpAction } = await import("../src/server/otpAuth");
      const result = await handleOtpAction(action, body);
      res.status(result.ok ? 200 : 400).json(result);
      return;
    }

    const { handlePulse } = await import("../src/server/engine");
    const result = await handlePulse(body);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error del servidor";
    res.status(500).json({ ok: false, error: message });
  }
}
