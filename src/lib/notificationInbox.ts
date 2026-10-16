export function explainNotificationError(message: string, fallback: string) {
  const text = message.trim();
  if (text.includes("Could not find the function") || text.includes("schema cache")) {
    return "Los avisos todavía no están disponibles. Falta activar la actualización en el servidor.";
  }
  return text || fallback;
}

export function canMarkAllRead(unread: number, items: { read: boolean }[]) {
  return unread > 0 || items.some((item) => !item.read);
}

export function nextInboxAfterReadAll<T extends { read: boolean }>(
  current: { unread: number; items: T[] },
  outcome: { ok: true } | { ok: false; message: string },
) {
  if (!outcome.ok) {
    return { unread: current.unread, items: current.items, error: outcome.message, confirmed: false as const };
  }
  return {
    unread: 0,
    items: current.items.map((item) => ({ ...item, read: true })),
    error: "",
    confirmed: true as const,
  };
}
