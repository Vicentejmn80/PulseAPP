/** Puntos virtuales. RETOS_CUENTAN_PARA_PREMIO_RONDA = false: el cierre del premio
 * usa pulse_prize_points, que no suma movimientos reto_*. */
export const RETO_MIN = 2;
export const RETO_MAX = 20;
export const RETO_MAX_PORCENTAJE = 25;
export const RETO_MAX_ACTIVOS = 5;
export const RETO_MAX_PAR_DIA = 3;
export const RETO_MAX_PUNTOS_DIA = 100;
export const RETOS_CUENTAN_PARA_PREMIO_RONDA = false;
/** Lanzamiento: los retos entre usuarios no se ofrecen. El backend SQL se apaga con la migración reversible. */
export const USER_RETOS_ENABLED = false;
export const RETO_QUICK_STAKES = [5, 10, 20] as const;

export function maxRetoStake(totalPoints: number) {
  const available = Math.max(0, Math.floor(totalPoints));
  const percentCap = Math.floor((available * RETO_MAX_PORCENTAJE) / 100);
  return Math.min(RETO_MAX, percentCap, available);
}

export function retoStakeAllowed(stake: number, totalPoints: number) {
  if (!Number.isInteger(stake)) return false;
  if (stake < RETO_MIN || stake > RETO_MAX) return false;
  return stake <= maxRetoStake(totalPoints);
}
