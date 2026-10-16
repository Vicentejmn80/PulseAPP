import { describe, expect, it } from "vitest";
import { canMarkAllRead, explainNotificationError, nextInboxAfterReadAll } from "@/lib/notificationInbox";

const unreadItem = { id: "ntf_1", read: false, title: "¡Marcador exacto! 🎯 +80 puntos" };

describe("bandeja de avisos", () => {
  it("no marca una lista vacía", () => {
    expect(canMarkAllRead(0, [])).toBe(false);
    const next = nextInboxAfterReadAll({ unread: 0, items: [] }, { ok: true });
    expect(next.confirmed).toBe(true);
    expect(next.unread).toBe(0);
    expect(next.items).toEqual([]);
  });

  it("al confirmar, deja leídos el contador y la lista", () => {
    const next = nextInboxAfterReadAll({ unread: 2, items: [unreadItem, { id: "ntf_2", read: true }] }, { ok: true });
    expect(next.confirmed).toBe(true);
    expect(next.unread).toBe(0);
    expect(next.error).toBe("");
    expect(next.items.every((item) => item.read)).toBe(true);
  });

  it("si el servidor falla, conserva los no leídos y explica el error", () => {
    const current = { unread: 1, items: [unreadItem] };
    const message = explainNotificationError(
      "Could not find the function public.pulse_notifications_read_all(p_token) in the schema cache",
      "No se pudieron marcar los avisos.",
    );
    const next = nextInboxAfterReadAll(current, { ok: false, message });
    expect(next.confirmed).toBe(false);
    expect(next.unread).toBe(1);
    expect(next.items[0]?.read).toBe(false);
    expect(next.error).toBe("Los avisos todavía no están disponibles. Falta activar la actualización en el servidor.");
    expect(explainNotificationError("Entra de nuevo para ver tus avisos.", "No se pudieron marcar los avisos.")).toBe("Entra de nuevo para ver tus avisos.");
  });
});
