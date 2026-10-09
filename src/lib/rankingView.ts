/** Vecinos arriba y abajo de mi fila en "Tu zona". */
export const ZONA_VECINOS = 2;
export const RANKING_TOP = 10;

export function shortAlias(alias: string) {
  const parts = alias.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return alias.trim();
  return `${parts[0]} ${parts[1].slice(0, 1).toUpperCase()}.`;
}

export function pointsToPass(mine: number, above: number) {
  return above - mine + 1;
}

/** Zona sin repetir el Top y sin filas por debajo del último. */
export function zoneBounds(position: number, total: number, top = RANKING_TOP, neighbors = ZONA_VECINOS) {
  if (position <= top || position < 1 || total < 1) return null;
  const start = Math.max(top + 1, position - neighbors);
  const end = Math.min(total, position + neighbors);
  if (start > end) return null;
  return { start, end };
}

export function showZoneEllipsis(firstZonePosition: number, top = RANKING_TOP) {
  return firstZonePosition > top + 1;
}
