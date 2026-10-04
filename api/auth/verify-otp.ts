import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyOtp } from "../_lib/otpAuth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Método no permitido." });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const result = await verifyOtp(body as Record<string, unknown>);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Error del servidor",
    });
  }
}
