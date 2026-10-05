function envText(key: string) {
  const raw = (import.meta.env as Record<string, unknown>)[key];
  return String(raw ?? "").trim();
}

/**
 * Copy configurable para demos.
 * - Cambia en Vercel / entorno con `VITE_TOBO_ROUND_PRIZE_SUBTITLE`.
 * - Evita hardcodearlo en múltiples pantallas.
 */
export const TOBO_ROUND_PRIZE_SUBTITLE =
  envText("VITE_TOBO_ROUND_PRIZE_SUBTITLE") ||
  "Acumula puntos durante esta ronda. 🥇🥈🥉 Los tres primeros lugares ganan un tobo de cerveza.";

