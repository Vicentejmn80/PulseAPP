import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { canMarkAllRead, nextInboxAfterReadAll } from "@/lib/notificationInbox";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/services/notificationsApi";

function badgeLabel(count: number) {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const known = useRef<Set<string> | null>(null);

  async function refresh(nextOffset = 0, announce = true) {
    try {
      const result = await listNotifications(nextOffset);
      setUnread(result.unread);
      setHasMore(result.items.length === 20);
      setOffset(nextOffset);
      setItems((current) => (nextOffset === 0 ? result.items : [...current, ...result.items]));
      setError("");
      if (nextOffset === 0 && announce && known.current) {
        const fresh = result.items.find((item) => !known.current?.has(item.id) && !item.datos?.silenciosa && !item.read);
        if (fresh) setToast(fresh.title);
      }
      if (nextOffset === 0) known.current = new Set(result.items.map((item) => item.id));
    } catch (reason: unknown) {
      if (nextOffset === 0) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los avisos.");
    }
  }

  useEffect(() => {
    void refresh(0, false);
    const timer = window.setInterval(() => void refresh(0), 45_000);
    function onShow() {
      if (document.visibilityState === "visible") void refresh(0);
    }
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
    // El refresco usa el estado más reciente dentro de refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function openItem(item: AppNotification) {
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
    if (!item.read && !item.datos?.silenciosa) setUnread((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(item.id);
    } catch {
      // Si falla el marcado, el próximo refresco lo vuelve a mostrar.
    }
    setOpen(false);
    const matchId = item.datos?.partidoId;
    if (matchId) navigate(`/tobo/partidos/${matchId}`);
  }

  async function markAll() {
    if (!canMarkAllRead(unread, items) || marking) return;
    setMarking(true);
    setError("");
    try {
      await markAllNotificationsRead();
      const next = nextInboxAfterReadAll({ unread, items }, { ok: true });
      setItems(next.items);
      setUnread(next.unread);
      await refresh(0, false);
    } catch (reason: unknown) {
      const next = nextInboxAfterReadAll(
        { unread, items },
        { ok: false, message: reason instanceof Error ? reason.message : "No se pudieron marcar los avisos." },
      );
      setError(next.error);
    } finally {
      setMarking(false);
    }
  }

  const label = badgeLabel(unread);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void refresh(0, false);
        }}
        aria-label={label ? `Notificaciones, ${label} sin leer` : "Notificaciones"}
        className="relative flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--t-card, #14171A)", color: "var(--t-accent, #C6FF3D)", border: "1px solid var(--t-border, #2A2F33)" }}
      >
        <Bell className="h-5 w-5" />
        {label ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF4D6A] px-1 text-[10px] font-extrabold text-white">{label}</span>
        ) : null}
      </button>
      {toast ? (
        <div className="fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-50 w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl bg-[#14171A] px-4 py-3 text-[13px] font-extrabold text-white shadow-lg" style={{ border: "1px solid #C6FF3D" }} role="status">
          {toast}
        </div>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={() => setOpen(false)} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-title"
            className="max-h-[85dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] bg-[#14171A] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 text-white"
            style={{ border: "1px solid #2A2F33" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="notifications-title" className="text-[20px] font-extrabold">Avisos</h2>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 text-[13px] font-extrabold text-[#C9D0D6]">Cerrar</button>
            </div>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={!canMarkAllRead(unread, items) || marking}
              className="mt-2 min-h-11 text-[13px] font-extrabold text-[#C6FF3D] disabled:opacity-40"
            >
              {marking ? "Marcando…" : "Marcar todas como leídas"}
            </button>
            {error ? <p className="mt-3 text-[13px] font-bold text-[#FF8A8A]">{error}</p> : null}
            {items.length === 0 && !error ? <p className="mt-6 text-[14px] font-semibold text-[#C9D0D6]">Aún no tienes notificaciones</p> : null}
            <ul className="mt-3 flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(item)}
                    className="w-full rounded-2xl px-3 py-3 text-left"
                    style={{ backgroundColor: item.read || item.datos?.silenciosa ? "#101316" : "#1A2208", border: "1px solid #2A2F33" }}
                  >
                    <p className="text-[14px] font-extrabold">{item.title}</p>
                    <p className="mt-1 text-[13px] font-semibold leading-snug text-[#C9D0D6]">{item.body}</p>
                  </button>
                </li>
              ))}
            </ul>
            {hasMore ? (
              <button type="button" onClick={() => void refresh(offset + 20, false)} className="mt-3 min-h-11 w-full text-[13px] font-extrabold text-[#C6FF3D]">Ver más</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
