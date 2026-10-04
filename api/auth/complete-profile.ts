import type { VercelRequest, VercelResponse } from "@vercel/node";
import { completeOtpProfile } from "../../lib/registration/otpAuth.mjs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, code: "REGISTRATION_ERROR", error: "Método no permitido." });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const result = await completeOtpProfile(body as Record<string, unknown>);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: "REGISTRATION_ERROR",
      error: error instanceof Error ? error.message : "No se pudo crear el perfil.",
    });
  }
}
