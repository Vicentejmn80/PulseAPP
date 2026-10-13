import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { RETO_MIN, RETO_QUICK_STAKES, retoStakeAllowed } from "@/config/retos";
import { formato } from "@/lib/format";
import { closesInLabel, visibleRetoGames } from "@/lib/retoFlow";
import { listMatches, type BaseballMatch } from "@/services/matchesApi";
import { retoBoard, retoCreate, retoPrefs, retoSearch } from "@/services/retosApi";
import { closeRetoSheet, readRetoSheet, subscribeRetoSheet } from "@/state/retoSheet";

const SEND_ERROR = "No pudimos enviar el reto. Inténtalo de nuevo.";
const PHRASES = ["Juégalo pues", "Te voy a ganar"];
const LEVELS = [
  { id: "beginner", label: "Iniciado" },
  { id: "intermediate", label: "Intermedio" },
  { id: "advanced", label: "Avanzado" },
];

export function RetoSheetHost() {
  const request = useSyncExternalStore(subscribeRetoSheet, readRetoSheet);
  if (!request) return null;
  return <RetoSheet key={request.id} request={request} />;
}

function RetoSheet({ request }: { request: NonNullable<ReturnType<typeof readRetoSheet>> }) {
  const navigate = useNavigate();
  const fixedGame = Boolean(request.matchId);
  const fixedTrivia = Boolean(request.triviaLevel);
  const steps = fixedGame || fixedTrivia ? 2 : 3;
  const [step, setStep] = useState(0);
  const [games, setGames] = useState<BaseballMatch[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<"next" | "trivia" | "other">(fixedTrivia ? "trivia" : "next");
  const [matchId, setMatchId] = useState(request.matchId);
  const [level, setLevel] = useState(request.triviaLevel || "beginner");
  const [alias, setAlias] = useState(request.alias);
  const [hits, setHits] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [stake, setStake] = useState(request.stake || 5);
  const [message, setMessage] = useState(request.message);
  const [points, setPoints] = useState(0);
  const [locked, setLocked] = useState(0);
  const [available, setAvailable] = useState(0);
  const [maxStake, setMaxStake] = useState(0);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentAlias, setSentAlias] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listMatches().catch(() => [] as BaseballMatch[]), retoPrefs().catch(() => null)])
      .then(([rows, prefs]) => {
        if (!alive) return;
        setGames(rows);
        const open = visibleRetoGames(rows).open;
        if (!request.matchId) setMatchId(open[0]?.id || "");
        if (prefs?.adultConfirmed) {
          setAdultConfirmed(true);
          setAdult(true);
        }
        setRecent(prefs?.recent ?? []);
      })
      .catch((reason: unknown) => console.error("reto", reason));
    return () => {
      alive = false;
    };
  }, [request.matchId]);

  useEffect(() => {
    const query = alias.trim();
    if (query.length < 3) {
      setHits([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      retoSearch(query).then(setHits).catch((reason: unknown) => {
        console.error("reto", reason);
        setHits([]);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [alias]);

  const catalog = visibleRetoGames(games, expanded);
  const selected = games.find((game) => game.id === (fixedGame ? request.matchId : matchId)) ?? null;
  const needsPrediction = (fixedGame || target !== "trivia") && selected && !selected.prediction;
  const kind = fixedTrivia || (!fixedGame && target === "trivia") ? "trivia" : "game";

  async function refreshPoints() {
    const board = await retoBoard();
    setPoints(board.points);
    setLocked(board.locked);
    setAvailable(board.available);
    setMaxStake(board.maxStake);
    if (stake > board.maxStake && board.maxStake >= RETO_MIN) setStake(board.maxStake);
  }

  useEffect(() => {
    if (step !== steps - 1) return;
    refreshPoints().catch((reason: unknown) => console.error("reto", reason));
  }, [step, steps]);

  function next() {
    setError("");
    if (step === 0 && alias.trim().length < 3) {
      setError("Escribe el alias de tu rival.");
      return;
    }
    if (!fixedGame && !fixedTrivia && step === 1 && target !== "trivia" && !matchId) {
      setError("Elige un juego abierto.");
      return;
    }
    if (needsPrediction && (fixedGame || step === 1)) return;
    setStep((value) => Math.min(steps - 1, value + 1));
  }

  async function send() {
    setError("");
    if (!adultConfirmed && !adult) {
      setError("Los retos son solo para mayores de 18.");
      return;
    }
    if (!retoStakeAllowed(stake, available)) {
      setError("No puedes apostar más puntos de los que tienes.");
      return;
    }
    setBusy(true);
    try {
      const result = await retoCreate({
        kind,
        alias: alias.trim(),
        stake,
        message,
        matchId: kind === "game" ? (fixedGame ? request.matchId : matchId) : "",
        triviaLevel: kind === "trivia" ? (fixedTrivia ? request.triviaLevel : level) : "",
        adult: true,
      });
      setSentAlias(result.alias || alias.trim());
    } catch (reason: unknown) {
      console.error("reto", reason);
      setError(SEND_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    closeRetoSheet();
    navigate("/tobo");
  }

  useEffect(() => {
    if (!sentAlias) return undefined;
    const timer = window.setTimeout(finish, 1400);
    return () => window.clearTimeout(timer);
  }, [sentAlias]);

  return (
    <div className="fixed inset-0 z-40 flex items-end" style={{ backgroundColor: "rgba(0,0,0,0.62)" }}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={() => closeRetoSheet()} />
      <section
        className="relative max-h-[88%] w-full overflow-y-auto rounded-t-[28px] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
        style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
      >
        {sentAlias ? (
          <div className="px-2 py-10 text-center">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Listo</p>
            <h2 className="mt-3 text-[28px] font-extrabold">Reto enviado a @{sentAlias}</h2>
            <button type="button" onClick={finish} className="mt-6 min-h-12 w-full rounded-2xl text-[15px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
              Volver al inicio
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              {Array.from({ length: steps }, (_, index) => (
                <span key={index} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: index <= step ? "var(--t-accent)" : "var(--t-border)" }} />
              ))}
            </div>
            {step === 0 && (
              <>
                <h2 className="text-[22px] font-extrabold">¿A quién retas?</h2>
                <input
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  placeholder="Alias, desde 3 letras"
                  aria-label="Alias del rival"
                  autoComplete="off"
                  className="mt-4 h-12 w-full rounded-2xl px-3 text-[16px] font-bold outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                />
                {hits.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {hits.map((name) => (
                      <button key={name} type="button" onClick={() => { setAlias(name); setHits([]); }} className="min-h-11 rounded-2xl px-3 text-left text-[15px] font-extrabold" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {recent.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>Rivales recientes</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recent.map((name) => (
                        <button key={name} type="button" onClick={() => setAlias(name)} className="min-h-10 rounded-full px-3 text-[13px] font-extrabold" style={{ backgroundColor: alias === name ? "var(--t-accent)" : "rgba(255,255,255,0.06)", color: alias === name ? "var(--t-accent-text)" : "inherit" }}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {step === 1 && !fixedGame && !fixedTrivia && (
              <>
                <h2 className="text-[22px] font-extrabold">¿En qué?</h2>
                <div className="mt-4 flex flex-col gap-2">
                  <Choice on={target === "next"} onClick={() => { setTarget("next"); setMatchId(catalog.open[0]?.id || ""); }}>
                    <p className="text-[16px] font-extrabold">Próximo juego</p>
                    {catalog.open[0] && (
                      <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
                        {catalog.open[0].awayTeam} vs {catalog.open[0].homeTeam} · {closesInLabel(catalog.open[0].startsAt)}
                      </p>
                    )}
                  </Choice>
                  <Choice on={target === "trivia"} onClick={() => setTarget("trivia")}>
                    <p className="text-[16px] font-extrabold">Trivia de hoy</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {LEVELS.map((item) => (
                        <button key={item.id} type="button" onClick={() => { setTarget("trivia"); setLevel(item.id); }} className="min-h-10 rounded-xl text-[12px] font-extrabold" style={level === item.id && target === "trivia" ? { backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" } : { backgroundColor: "rgba(255,255,255,0.06)" }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </Choice>
                  <Choice on={target === "other"} onClick={() => setTarget("other")}>
                    <p className="text-[16px] font-extrabold">Otro juego</p>
                  </Choice>
                  {target === "other" && (
                    <div className="flex flex-col gap-2">
                      {catalog.visible.map((game) => (
                        <button key={game.id} type="button" onClick={() => setMatchId(game.id)} className="min-h-12 rounded-2xl px-3 text-left text-[14px] font-extrabold" style={matchId === game.id ? { backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" } : { backgroundColor: "rgba(255,255,255,0.06)" }}>
                          {game.awayTeam} vs {game.homeTeam}
                          <span className="mt-0.5 block text-[12px] font-bold">{closesInLabel(game.startsAt)}</span>
                        </button>
                      ))}
                      {catalog.hidden > 0 && (
                        <button type="button" onClick={() => setExpanded((value) => !value)} className="min-h-11 text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
                          {expanded ? "Ver menos" : "Ver más"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            {(fixedGame || fixedTrivia || step === steps - 1) && step === steps - 1 && (
              <>
                <h2 className="text-[22px] font-extrabold">¿Cuánto apuestas?</h2>
                <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Tienes {formato(points)} pts</p>
                <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>{formato(locked)} pts en juego</p>
                <p className="text-[13px] font-extrabold">Disponibles para apostar: {formato(available)}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {RETO_QUICK_STAKES.map((value) => (
                    <button key={value} type="button" disabled={value > maxStake} onClick={() => setStake(value)} className="min-h-12 rounded-2xl text-[15px] font-extrabold disabled:opacity-40" style={stake === value ? { backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" } : { backgroundColor: "rgba(255,255,255,0.06)" }}>
                      {value}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block text-[12px] font-extrabold" style={{ color: "var(--t-muted)" }}>
                  Manual ({RETO_MIN} a {formato(maxStake)} pts)
                  <input inputMode="numeric" aria-label="Puntos del reto" value={String(stake)} onChange={(event) => setStake(Number(event.target.value.replace(/\D/g, "")) || 0)} className="mt-1 h-12 w-full rounded-2xl px-3 text-[16px] font-bold outline-none" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "inherit" }} />
                </label>
                <p className="mt-3 text-[14px] font-extrabold" style={{ color: "var(--t-accent)" }}>
                  Si ganas +{formato(stake)} · si pierdes −{formato(stake)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PHRASES.map((phrase) => (
                    <button key={phrase} type="button" onClick={() => setMessage(phrase)} className="min-h-10 rounded-full px-3 text-[13px] font-extrabold" style={{ backgroundColor: message === phrase ? "var(--t-accent)" : "rgba(255,255,255,0.06)", color: message === phrase ? "var(--t-accent-text)" : "inherit" }}>
                      {phrase}
                    </button>
                  ))}
                </div>
                <input value={message} maxLength={60} aria-label="Mensaje del reto" placeholder="Mensaje opcional" onChange={(event) => setMessage(event.target.value.slice(0, 60))} className="mt-3 h-12 w-full rounded-2xl px-3 text-[15px] font-bold outline-none" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                {!adultConfirmed && (
                  <label className="mt-3 flex items-center gap-2 text-[13px] font-bold">
                    <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
                    Confirmo que tengo 18 años o más
                  </label>
                )}
              </>
            )}
            {needsPrediction && (fixedGame || (step === 1 && target !== "trivia")) && (
              <div className="mt-4 rounded-2xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <p className="text-[15px] font-extrabold">Primero haz tu pronóstico</p>
                <button type="button" onClick={() => { closeRetoSheet(); navigate(`/tobo/partidos/${selected?.id}`); }} className="mt-3 min-h-11 w-full rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
                  Ir al pronóstico
                </button>
              </div>
            )}
            {error && <p className="mt-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {step > 0 ? (
                <button type="button" onClick={() => setStep((value) => value - 1)} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>Atrás</button>
              ) : (
                <button type="button" onClick={() => closeRetoSheet()} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ border: "1px solid var(--t-border)" }}>Cerrar</button>
              )}
              {step < steps - 1 ? (
                <button type="button" onClick={next} className="min-h-12 rounded-2xl text-[14px] font-extrabold" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>Siguiente</button>
              ) : (
                <button type="button" disabled={busy || Boolean(needsPrediction)} onClick={() => void send()} className="min-h-12 rounded-2xl px-2 text-[13px] font-extrabold disabled:opacity-50" style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}>
                  {busy ? "Enviando…" : `Enviar reto · Tú VS @${alias.trim() || "rival"}`}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Choice({ children, on, onClick }: { children: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl px-3 py-3 text-left" style={{ border: on ? "2px solid var(--t-accent)" : "1px solid var(--t-border)", backgroundColor: "rgba(255,255,255,0.03)" }}>
      {children}
    </button>
  );
}
