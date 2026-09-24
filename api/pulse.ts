import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Método no permitido." });
    return;
  }
  try {
    const { handlePulse } = await import("../src/server/engine");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const result = await handlePulse(body as Record<string, unknown>);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error del servidor";
    res.status(500).json({ ok: false, error: message });
  }
}
