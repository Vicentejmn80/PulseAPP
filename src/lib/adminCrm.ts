export const USER_PAGE_SIZE = 50;

export function whatsappHref(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const text = message.trim();
  if (!text) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function usersCsv(rows: { alias: string; phone: string; createdAt: string; lastSessionAt?: string | null; points: number }[]) {
  const header = "alias,telefono,alta,ultima_entrada,puntos";
  const lines = rows.map((row) =>
    [row.alias, row.phone, row.createdAt, row.lastSessionAt ?? "", String(row.points)].map(csvCell).join(","),
  );
  return `${header}\n${lines.join("\n")}`;
}

/** Nuevo: alta en 24 h. Inactivo: sin sesión en 7 días. Suspendido gana sobre el resto. */
export function userPresence(input: {
  createdAt: string;
  lastSessionAt?: string | null;
  suspendedAt?: string | null;
  now?: number;
}) {
  if (input.suspendedAt) return "suspended" as const;
  const now = input.now ?? Date.now();
  const created = Date.parse(input.createdAt);
  if (Number.isFinite(created) && now - created < 24 * 60 * 60 * 1000) return "new" as const;
  const last = input.lastSessionAt ? Date.parse(input.lastSessionAt) : Number.NaN;
  if (!Number.isFinite(last) || now - last >= 7 * 24 * 60 * 60 * 1000) return "inactive" as const;
  return "active" as const;
}

export function chartHeights(counts: number[]) {
  const max = Math.max(1, ...counts, 0);
  return counts.map((count) => Math.max(4, Math.round((count / max) * 100)));
}

export function previewCopy(stats: {
  predictions: number;
  winners: number;
  exact: number;
  points: number;
  bands?: { label: string; count: number }[];
}) {
  const head = `${stats.predictions} pronósticos · ${stats.winners} acertaron ganador · ${stats.exact} marcadores exactos · +${stats.points} puntos totales a repartir`;
  const extra = (stats.bands ?? []).filter((band) => band.count > 0).map((band) => `${band.label}: ${band.count}`).join(" · ");
  return extra ? `${head} · ${extra}` : head;
}
