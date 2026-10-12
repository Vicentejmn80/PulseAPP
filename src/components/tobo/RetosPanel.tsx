import { useEffect, useState, type ReactNode } from "react";
import { Swords } from "lucide-react";
import { RETO_MIN, RETO_QUICK_STAKES, retoStakeAllowed } from "@/config/retos";
import { CardHead, ToboCard } from "@/components/tobo/surface";
import { formato } from "@/lib/format";
import { listMatches, type BaseballMatch } from "@/services/matchesApi";
import { retoBlock, retoBoard, retoCreate, retoRespond, retoSearch, type RetoBoard, type RetoItem } from "@/services/retosApi";

type Kind = "game" | "trivia";

const EMPTY: RetoBoard = { ok: true, won: 0, lost: 0, pending: 0, points: 0, maxStake: 0, items: [] };

function leftLabel(until: string | null) {
  if (!until) return "";
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return "El plazo ya cerró";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `Quedan ${minutes} min para aceptar`;
  const hours = Math.ceil(minutes / 60);
  return `Quedan ${hours} h para aceptar`;
}

function outcomeLine(item: RetoItem) {
  if (item.outcome === "won") return `Ganaste ${formato(item.stake)} pts`;
  if (item.outcome === "lost") return `Perdiste ${formato(item.stake)} pts`;
  if (item.outcome === "tie" || item.outcome === "void" || item.outcome === "expired" || item.outcome === "rejected") {
    return "Se devolvieron los puntos";
  }
  if (item.outcome === "live") return "En juego";
  return "Pendiente";
}

export function RetosPanel({
  matchId = "",
  triviaLevel = "",
  predictionSaved = true,
  startOpen = false,
}: {
  matchId?: string;
  triviaLevel?: string;
  predictionSaved?: boolean;
  startOpen?: boolean;
}) {
  const fixedKind: Kind | "" = matchId ? "game" : triviaLevel ? "trivia" : "";
  const [board, setBoard] = useState<RetoBoard>(EMPTY);
  const [open, setOpen] = useState(startOpen);
  const [kind, setKind] = useState<Kind>(fixedKind || "game");
  const [games, setGames] = useState<BaseballMatch[]>([]);
  const [chosenMatch, setChosenMatch] = useState(matchId);
  const [level, setLevel] = useState(triviaLevel || "beginner");
  const [alias, setAlias] = useState("");
  const [matches, setMatches] = useState<string[]>([]);
  const [stake, setStake] = useState(5);
  const [message, setMessage] = useState("");
  const [adult, setAdult] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [matchId, triviaLevel]);

  useEffect(() => {
    if (matchId || kind !== "game") return undefined;
    let alive = true;
    listMatches()
      .then((rows) => {
        if (!alive) return;
        const open = rows.filter((row) => !row.demo && !row.simulation && row.status === "scheduled");
        setGames(open);
        setChosenMatch((current) => current || open[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [kind, matchId]);

  useEffect(() => {
    const query = alias.trim();
    if (query.length < 3) {
      setMatches([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      retoSearch(query)
        .then(setMatches)
        .catch((reason: unknown) => {
          setMatches([]);
          setError(reason instanceof Error ? reason.message : "No se pudo buscar.");
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [alias]);

  const visible = board.items.filter((item) => {
    if (matchId) return item.matchId === matchId;
    if (triviaLevel) return item.triviaLevel === triviaLevel;
    return true;
  });
  const incoming = visible.filter((item) => item.incoming && item.status === "pending");
  const live = visible.filter((item) => item.status === "live" || (item.status === "pending" && !item.incoming));
  const finished = visible.filter((item) => ["settled", "void", "expired", "rejected"].includes(item.status)).slice(0, 3);

  async function send(rematch?: RetoItem) {
    setError("");
    setNote("");
    if (!rematch && kind === "game" && matchId && !predictionSaved) {
      setError("Primero guarda tu pronóstico.");
      return;
    }
    const chosenAlias = rematch?.rival || alias.trim();
    const chosenStake = rematch?.stake || stake;
    if (!retoStakeAllowed(chosenStake, board.points) && !rematch) {
      setError("No puedes apostar más puntos de los que tienes.");
      return;
    }
    if (!adult && !rematch) {
      setError("Los retos son solo para mayores de 18.");
      return;
    }
    setBusy(true);
    try {
      const result = await retoCreate({
        kind: rematch?.kind || (fixedKind || kind),
        alias: chosenAlias,
        stake: chosenStake,
        message: rematch ? "" : message,
        matchId: rematch?.matchId || chosenMatch || matchId,
        triviaLevel: rematch?.triviaLevel || triviaLevel || level,
        adult: true,
      });
      setAlias("");
      setMessage("");
      setNote(`Reto enviado a @${result.alias || chosenAlias} por ${formato(result.stake || chosenStake)} pts.`);
      setOpen(false);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el reto.");
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
      setError(reason instanceof Error ? reason.message : "No se pudo responder.");
    } finally {
      setBusy(false);
    }
  }

  async function block(name: string) {
    setError("");
    try {
      await retoBlock(name);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo bloquear.");
    }
  }

  return (
    <ToboCard>
      <CardHead icon={Swords} title="Retos" />
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
          style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
        >
          VS
        </span>
        <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--t-muted)" }}>
          Apuesta puntos con un amigo. Quien gane se lleva los puntos del reto.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Score label="Ganados" value={formato(board.won)} />
        <Score label="Perdidos" value={formato(board.lost)} />
        <Score label="Pendientes" value={formato(board.pending)} />
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl text-[15px] font-extrabold"
        style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
      >
        Retar a un amigo
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          {!fixedKind && (
            <div className="grid grid-cols-2 gap-2">
              <Pick on={kind === "game"} onClick={() => setKind("game")}>Un juego</Pick>
              <Pick on={kind === "trivia"} onClick={() => setKind("trivia")}>Trivia de hoy</Pick>
            </div>
          )}
          {!matchId && (fixedKind === "game" || kind === "game") && fixedKind !== "trivia" && (
            <div className="flex flex-col gap-2">
              {games.map((game) => (
                <Pick key={game.id} on={chosenMatch === game.id} onClick={() => setChosenMatch(game.id)}>
                  {`${game.awayTeam} vs ${game.homeTeam}`}
                </Pick>
              ))}
              {games.length === 0 && <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>No hay juegos abiertos para retar.</p>}
            </div>
          )}
          {(fixedKind === "trivia" || (!fixedKind && kind === "trivia")) && !triviaLevel && (
            <div className="grid grid-cols-3 gap-2">
              <Pick on={level === "beginner"} onClick={() => setLevel("beginner")}>Iniciado</Pick>
              <Pick on={level === "intermediate"} onClick={() => setLevel("intermediate")}>Intermedio</Pick>
              <Pick on={level === "advanced"} onClick={() => setLevel("advanced")}>Avanzado</Pick>
            </div>
          )}
          <label className="text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>
            Alias del rival
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Desde 3 letras"
              aria-label="Alias del rival"
              autoComplete="off"
              className="mt-1 h-12 w-full rounded-2xl px-3 text-[15px] font-bold outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "inherit" }}
            />
          </label>
          {matches.length > 0 && (
            <div className="flex flex-col gap-1">
              {matches.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setAlias(name);
                    setMatches([]);
                  }}
                  className="min-h-11 rounded-2xl px-3 text-left text-[15px] font-extrabold"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {RETO_QUICK_STAKES.map((value) => (
              <Pick key={value} on={stake === value} disabled={value > board.maxStake} onClick={() => setStake(value)}>
                {value} pts
              </Pick>
            ))}
          </div>
          <label className="text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>
            Apuesta ({RETO_MIN} a {formato(board.maxStake)} pts)
            <input
              inputMode="numeric"
              value={String(stake)}
              aria-label="Puntos del reto"
              onChange={(event) => setStake(Number(event.target.value.replace(/\D/g, "")) || 0)}
              className="mt-1 h-12 w-full rounded-2xl px-3 text-[15px] font-bold outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "inherit" }}
            />
          </label>
          <label className="text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>
            Mensaje para el rival
            <input
              value={message}
              maxLength={60}
              aria-label="Mensaje del reto"
              onChange={(event) => setMessage(event.target.value.slice(0, 60))}
              placeholder="Opcional, 60 caracteres"
              className="mt-1 h-12 w-full rounded-2xl px-3 text-[15px] font-bold outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "inherit" }}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] font-bold">
            <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
            Confirmo que tengo 18 años o más
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="min-h-12 rounded-2xl text-[15px] font-extrabold disabled:opacity-50"
            style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
          >
            {busy ? "Enviando…" : "Enviar reto"}
          </button>
        </div>
      )}

      {incoming.map((item) => (
        <article key={item.id} className="mt-4 rounded-2xl p-3" style={{ backgroundColor: "rgba(207,255,0,0.08)" }}>
          <p className="text-[15px] font-extrabold">@{item.rival} te reta</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            {item.label} · {formato(item.stake)} pts
          </p>
          {item.message && <p className="mt-1 text-[13px] font-semibold">“{item.message}”</p>}
          <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{leftLabel(item.acceptUntil)}</p>
          <p className="mt-1 text-[12px] font-extrabold">Tú {item.h2hMine} – {item.rival} {item.h2hTheirs}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void respond(item, true)} className="min-h-11 rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Aceptar</button>
            <button type="button" disabled={busy} onClick={() => void respond(item, false)} className="min-h-11 rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>Rechazar</button>
          </div>
          <button type="button" onClick={() => void block(item.rival)} className="mt-2 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>Bloquear y silenciar</button>
        </article>
      ))}

      {live.map((item) => (
        <article key={item.id} className="mt-3 rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <p className="text-[15px] font-extrabold">Tú VS {item.rival}</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            {item.label} · {formato(item.stake)} pts · {item.status === "pending" ? "Esperando respuesta" : "En juego"}
          </p>
          <p className="mt-1 text-[13px] font-extrabold">Tú {item.h2hMine} – {item.rival} {item.h2hTheirs}</p>
          {item.mineScore != null && (
            <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
              Tú {formato(item.mineScore)} pts{item.rivalScore == null ? " · el resultado del rival sigue oculto" : ` · ${item.rival} ${formato(item.rivalScore)} pts`}
            </p>
          )}
        </article>
      ))}

      {finished.map((item) => (
        <article key={item.id} className="mt-3 rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <p className="text-[15px] font-extrabold">{outcomeLine(item)}</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            VS {item.rival} · Tú {item.h2hMine} – {item.rival} {item.h2hTheirs}
          </p>
          {(item.outcome === "won" || item.outcome === "lost") && (
            <button type="button" disabled={busy} onClick={() => void send(item)} className="mt-3 min-h-11 w-full rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
              Revancha
            </button>
          )}
        </article>
      ))}

      {note && <p className="mt-3 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>{note}</p>}
      {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
    </ToboCard>
  );
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-2 py-2 text-center" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
      <p className="text-[18px] font-extrabold tabular-nums">{value}</p>
      <p className="text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{label}</p>
    </div>
  );
}

function Pick({ children, on, disabled, onClick }: { children: ReactNode; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-2xl text-[13px] font-extrabold disabled:opacity-40"
      style={on
        ? { backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }
        : { backgroundColor: "rgba(255,255,255,0.06)", color: "inherit" }}
    >
      {children}
    </button>
  );
}
