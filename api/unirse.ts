import type { VercelRequest, VercelResponse } from "@vercel/node";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code ?? "").trim().toUpperCase();
  const host = String(req.headers.host ?? "pulse-app-nine-alpha.vercel.app");
  const origin = `https://${host}`;
  const next = `${origin}/tobo/unirse/${encodeURIComponent(code)}`;
  const image = `${origin}/og/league-invite-v2.png`;
  const imageAlt = "Invitación a liga de Béisbol Rush LVBP";

  let title = "Te invitaron a una liga";
  let description = "Pronostica, reta y compite en Béisbol Rush LVBP";

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    if (url && key && code) {
      const response = await fetch(`${url}/rest/v1/rpc/pulse_league_preview`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_code: code }),
      });
      const preview = (await response.json()) as { ok?: boolean; name?: string; inviter?: string };
      if (preview?.ok && preview.name) {
        title = `${preview.inviter || "Un rusher"} te invita a ${preview.name}`;
      }
    }
  } catch (reason: unknown) {
    console.error("unirse", reason);
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
  <meta property="og:url" content="${escapeHtml(`${origin}/unirse/${encodeURIComponent(code)}`)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />
</head>
<body style="background:#0B0D0F;color:#F5F7F2;font-family:sans-serif;padding:24px">
  <p>Te invitaron a Béisbol Rush LVBP.</p>
  <p><a href="${escapeHtml(next)}" style="color:#CCFF00">Continuar</a></p>
</body>
</html>`;

  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
}
