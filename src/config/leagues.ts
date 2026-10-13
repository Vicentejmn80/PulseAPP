export const LEAGUE_MAX_MEMBERS = 50;
export const LEAGUE_INVITE_DAYS = 7;

export const LEAGUE_SHARE_TEMPLATES = [
  `¡Épale! 🔥 {alias} te invita a su liga *{liga}* en Béisbol Rush LVBP ⚾
Aquí se pronostica, se reta y se sabe quién de verdad entiende de pelota. 😏
🔑 Código: *{codigo}*
👉 {enlace}
¿Te le mides? 🏆`,
  `⚾ Se armó la liga *{liga}* y falta TU nombre en el ranking. Entra a Béisbol Rush LVBP con el código *{codigo}* y demuestra que sabes más que todos. 💪
{enlace}`,
  `Dicen que tú sabes de pelota… 👀 Demuéstralo en *{liga}*.
🔑 Código: *{codigo}*
{enlace}`,
] as const;

export function leagueInviteLink(code: string, origin = typeof window === "undefined" ? "" : window.location.origin) {
  return `${origin.replace(/\/$/, "")}/unirse/${encodeURIComponent(code)}`;
}

export function pickLeagueShareText(vars: { alias: string; liga: string; codigo: string; enlace: string }, random = Math.random()) {
  const template = LEAGUE_SHARE_TEMPLATES[Math.floor(random * LEAGUE_SHARE_TEMPLATES.length)] ?? LEAGUE_SHARE_TEMPLATES[0];
  return template
    .replaceAll("{alias}", vars.alias)
    .replaceAll("{liga}", vars.liga)
    .replaceAll("{codigo}", vars.codigo)
    .replaceAll("{enlace}", vars.enlace);
}

export async function shareLeagueInvite(text: string) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ text });
      return "shared";
    }
  } catch (reason: unknown) {
    console.error("liga", reason);
  }
  try {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return "whatsapp";
  } catch (reason: unknown) {
    console.error("liga", reason);
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (reason: unknown) {
    console.error("liga", reason);
    return "failed";
  }
}
