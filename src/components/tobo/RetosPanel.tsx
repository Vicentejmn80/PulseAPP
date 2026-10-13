import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import { CardHead, ToboCard } from "@/components/tobo/surface";
import { formato } from "@/lib/format";
import { retoBoard, retoCancel, retoCreate, retoRespond, type RetoBoard, type RetoItem } from "@/services/retosApi";
import { openRetoSheet } from "@/state/retoSheet";

const EMPTY: RetoBoard = { ok: true, won: 0, lost: 0, pending: 0, points: 0, locked: 0, available: 0, maxStake: 0, items: [] };
const SEND_ERROR = "No pudimos enviar el reto. Inténtalo de nuevo.";
const COACH_PREFIX = "rusher-reto-coach:";

function coachKey(userId: string) {
  return `${COACH_PREFIX}${userId || "anon"}`;
}

function readCoach(userId: string) {
  try {
    return localStorage.getItem(coachKey(userId)) === "done";
  } catch {
    return true;
  }
}

function statusLabel(item: RetoItem) {
  if (item.outcome === "won") return `Ganaste ${formato(item.stake)} pts`;
  if (item.outcome === "lost") return `Perdiste ${formato(item.stake)} pts`;
  if (item.outcome === "live") return "En juego";
  if (item.status === "pending" && !item.incoming) return "Esperando";
  if (item.outcome === "tie" || item.outcome === "void" || item.outcome === "expired" || item.outcome === "rejected" || item.status === "cancelled") return "Sin cambio de puntos";
  return "Pendiente";
}

export function RetosPanel({
  matchId = "",
  triviaLevel = "",
  userId = "",
}: {
  matchId?: string;
  triviaLevel?: string;
  userId?: string;
}) {
  const [board, setBoard] = useState<RetoBoard>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coach, setCoach] = useState(false);

  async function reload() {
    const next = await retoBoard();
    setBoard(next);
  }

  useEffect(() => {
    let alive = true;
    retoBoard()
      .then((next) => {
        if (alive) setBoard(next);
      })
      .catch((reason: unknown) => console.error("reto", reason));
    return () => {
      alive = false;
    };
  }, [matchId, triviaLevel]);

  useEffect(() => {
    function onCoach() {
      if (!matchId && !triviaLevel && !readCoach(userId)) setCoach(true);
    }
    window.addEventListener("rusher-reto-coach", onCoach);
    if (!matchId && !triviaLevel && !readCoach(userId)) {
      try {
        if (localStorage.getItem("rusher-reto-coach-pending") === (userId || "1") || sessionStorage.getItem("rusher-reto-coach-now") === "1") {
          setCoach(true);
        }
      } catch {
        /* modo privado */
      }
    }
    return () => window.removeEventListener("rusher-reto-coach", onCoach);
  }, [matchId, triviaLevel, userId]);

  const visible = board.items.filter((item) => {
    if (matchId) return item.matchId === matchId;
    if (triviaLevel) return item.triviaLevel === triviaLevel;
    return true;
  });
  const incoming = visible.filter((item) => item.incoming && item.status === "pending");
  const active = visible.filter((item) => item.status === "live" || (item.status === "pending" && !item.incoming)).slice(0, 3);
  const finished = visible.filter((item) => item.outcome === "won" || item.outcome === "lost").slice(0, 1);

  function openSheet() {
    openRetoSheet({ matchId, triviaLevel });
  }

  async function cancel(item: RetoItem) {
    setError("");
    setBusy(true);
    try {
      await retoCancel(item.id);
      await reload();
    } catch (reason: unknown) {
      console.error("reto", reason);
      setError("No pudimos cancelar el reto. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function respond(item: RetoItem, accept: boolean) {
    setError("");
    setBusy(true);
    try {
      await retoRespond(item.id, accept);
      await reload();
    } catch (reason: unknown) {
      console.error("reto", reason);
      setError("No pudimos responder el reto. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function rematch(item: RetoItem) {
    setError("");
    setBusy(true);
    try {
      await retoCreate({
        kind: item.kind,
        alias: item.rival,
        stake: item.stake,
        message: "",
        matchId: item.matchId,
        triviaLevel: item.triviaLevel,
        adult: true,
      });
      await reload();
    } catch (reason: unknown) {
      console.error("reto", reason);
      setError(SEND_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function dismissCoach() {
    try {
      localStorage.setItem(coachKey(userId), "done");
      localStorage.removeItem("rusher-reto-coach-pending");
    } catch {
      /* modo privado */
    }
    setCoach(false);
    window.dispatchEvent(new Event("rusher-reto-coach-closed"));
  }

  return (
    <ToboCard>
      <CardHead icon={Swords} title="Retos" />
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
          VS
        </span>
        <div>
          <p className="text-[16px] font-extrabold">Apuesta puntos con un amigo</p>
          <p className="mt-1 text-[13px] font-semibold leading-snug" style={{ color: "var(--t-muted)" }}>
            Quien gane se lleva los puntos del reto.
          </p>
          <p className="mt-2 text-[13px] font-extrabold">Tienes {formato(board.points)} pts</p>
          <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{formato(board.locked)} pts en juego</p>
          <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Disponibles para apostar: {formato(board.available)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Score label="Ganados" value={formato(board.won)} />
        <Score label="Perdidos" value={formato(board.lost)} />
        <Score label="Pendientes" value={formato(board.pending)} />
      </div>
      <button type="button" onClick={openSheet} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl text-[15px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
        Retar a un amigo
      </button>
      {coach && (
        <div className="mt-3 rounded-2xl p-3" style={{ border: "1px solid var(--t-accent)" }}>
          <p className="text-[14px] font-extrabold">Desde aquí retas a un amigo.</p>
          <button type="button" onClick={dismissCoach} className="mt-2 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>Entendido</button>
        </div>
      )}
      {incoming.length > 0 && (
        <p className="mt-4 rounded-2xl px-3 py-2 text-[14px] font-extrabold" style={{ backgroundColor: "rgba(207,255,0,0.14)", color: "var(--t-accent)" }}>
          Te retaron. Responde antes de que cierre.
        </p>
      )}
      {incoming.map((item) => (
        <article key={item.id} className="mt-3 rounded-2xl p-3" style={{ backgroundColor: "rgba(207,255,0,0.08)" }}>
          <p className="text-[15px] font-extrabold">Tú VS @{item.rival}</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{item.label} · {formato(item.stake)} pts · Pendiente</p>
          <p className="mt-1 text-[12px] font-extrabold">Tú {item.h2hMine} – {item.rival} {item.h2hTheirs}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void respond(item, true)} className="min-h-11 rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Aceptar</button>
            <button type="button" disabled={busy} onClick={() => void respond(item, false)} className="min-h-11 rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>Rechazar</button>
          </div>
        </article>
      ))}
      {active.map((item) => (
        <article key={item.id} className="mt-3 rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <p className="text-[15px] font-extrabold">Tú VS @{item.rival}</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{item.label} · {formato(item.stake)} pts · {statusLabel(item)}</p>
          {item.status === "pending" && !item.incoming && (
            <button type="button" disabled={busy} onClick={() => void cancel(item)} className="mt-3 min-h-11 w-full rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>
              Cancelar reto
            </button>
          )}
        </article>
      ))}
      {finished.map((item) => (
        <article key={item.id} className="mt-3 rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <p className="text-[18px] font-extrabold">{statusLabel(item)}</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>VS @{item.rival} · Tú {item.h2hMine} – {item.rival} {item.h2hTheirs}</p>
          <button type="button" disabled={busy} onClick={() => void rematch(item)} className="mt-3 min-h-11 w-full rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
            Revancha
          </button>
        </article>
      ))}
      {visible.length === 0 && (
        <p className="mt-4 text-center text-[15px] font-extrabold">Reta a un pana y apuesten puntos</p>
      )}
      {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
    </ToboCard>
  );
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-2 py-3 text-center" style={{ backgroundColor: "rgba(207,255,0,0.08)" }}>
      <p className="text-[22px] font-extrabold tabular-nums" style={{ color: "var(--t-accent)" }}>{value}</p>
      <p className="text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{label}</p>
    </div>
  );
}
