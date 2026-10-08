import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CircleDot, Clock, Hand, Play, RefreshCw, Trophy, Zap, type LucideIcon } from "lucide-react";
import { GoldCta, GhostCta, IconChip, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { caracasDateKey, cycleContainingToday } from "@/lib/toboHome";
import { trackEvent } from "@/services/analytics";
import { listMyLeagues } from "@/services/leaguesApi";
import { listCycles, loadCycleBoard } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import {
  ANSWER_SECONDS,
  answerTrivia,
  formatCooldown,
  remainingMs,
  serverSkewMs,
  startTrivia,
  triviaStatus,
  type TriviaLevel,
  type TriviaLevelState,
  type TriviaQuestion,
  type TriviaResult,
} from "@/services/triviaApi";

/* ─── Level meta ─────────────────────────────────────────── */
type Phase = "picker" | "loading" | "playing" | "done";

interface LevelMeta {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  desc: string;
  pts: string;
  color: string;
}
const LEVELS: Record<TriviaLevel, LevelMeta> = {
  beginner: {
    icon: CircleDot,
    label: "Iniciado",
    sublabel: "Fácil",
    desc: "Reglas básicas y equipos de la LVBP. El punto de partida.",
    pts: "+5 pts por pregunta",
    color: "#22C55E",
  },
  intermediate: {
    icon: Hand,
    label: "Intermedio",
    sublabel: "Medio",
    desc: "Jugadores venezolanos y Grandes Ligas. Un reto real.",
    pts: "+5 pts por acierto",
    color: "#60A5FA",
  },
  advanced: {
    icon: Zap,
    label: "Avanzado",
    sublabel: "Difícil",
    desc: "Historia, estadísticas y récords. Solo los que saben.",
    pts: "+5 pts por acierto",
    color: "#C084FC",
  },
};
const LEVEL_KEY = "tobo-trivia-level";

function levelLine(row: TriviaLevelState | undefined, skewMs: number, now: number, checking: boolean) {
  if (checking) return "Confirmando…";
  if (!row || row.status === "available") return "Disponible";
  if (row.status === "in_progress") return "En curso";
  const left = remainingMs(row.availableAt, skewMs, now);
  if (left <= 0) return "Disponible nuevamente";
  return formatCooldown(left);
}

/* ─── Component ──────────────────────────────────────────── */
export function TriviaPage() {
  const navigate = useNavigate();
  const { reload } = usePulse();

  const [level, setLevel] = useState<TriviaLevel>("beginner");
  const [phase, setPhase] = useState<Phase>("picker");

  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ANSWER_SECONDS);
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState<Record<string, TriviaResult>>({});
  const [timedOutIds, setTimedOutIds] = useState<Set<string>>(new Set());
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [standing, setStanding] = useState<{ points: number; position: number | null; label: string } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [levels, setLevels] = useState<TriviaLevelState[]>([]);
  const [skewMs, setSkewMs] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const [checkingLevel, setCheckingLevel] = useState<TriviaLevel | null>(null);

  const blockTimer = useRef(false);
  const confirmedDue = useRef<string>("");

  /* ── Pick level and start ──────────────────────────────── */
  function refreshBoard() {
    return triviaStatus().then((board) => {
      setLevels(board.levels);
      setSkewMs(serverSkewMs(board.serverNow));
      return board;
    });
  }

  useEffect(() => {
    if (phase !== "picker") return;
    let alive = true;
    refreshBoard().catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : "No se pudo consultar las trivias.");
    });
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "picker") return;
    const dueKey = levels
      .filter((row) => row.status === "cooldown" && remainingMs(row.availableAt, skewMs, tick) === 0)
      .map((row) => row.level)
      .join(",");
    if (!dueKey) {
      confirmedDue.current = "";
      return;
    }
    if (dueKey === confirmedDue.current) return;
    confirmedDue.current = dueKey;
    let alive = true;
    refreshBoard()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCheckingLevel(null);
      });
    return () => {
      alive = false;
    };
  }, [phase, tick, levels, skewMs]);

  function pickLevel(l: TriviaLevel) {
    const row = levels.find((item) => item.level === l);
    if (row?.status === "cooldown" && remainingMs(row.availableAt, skewMs, Date.now()) > 0) return;
    if (row?.status === "cooldown") {
      setCheckingLevel(l);
      refreshBoard()
        .then((board) => {
          const next = board.levels.find((item) => item.level === l);
          if (next?.status === "available" || next?.status === "in_progress") {
            setCheckingLevel(null);
            beginLevel(l);
            return;
          }
          setCheckingLevel(null);
        })
        .catch(() => setCheckingLevel(null));
      return;
    }
    beginLevel(l);
  }

  function beginLevel(l: TriviaLevel) {
    localStorage.setItem(LEVEL_KEY, l);
    setLevel(l);
    setAlreadyDone(false);
    setError("");
    setPhase("loading");
  }

  useEffect(() => {
    const requested = sessionStorage.getItem("tobo-trivia-open") as TriviaLevel | null;
    if (!requested) return;
    sessionStorage.removeItem("tobo-trivia-open");
    beginLevel(requested);
  }, []);

  /* ── Load questions ────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "loading") return;
    blockTimer.current = false;
    let alive = true;
    setError("");
    startTrivia(level)
      .then(({ sessionId: id, questions: qs }) => {
        if (!alive) return;
        const unanswered = qs.filter((q) => !q.answered);
        setSessionId(id);
        if (qs.length === 0) {
          setError("No hay preguntas para este nivel.");
          setPhase("picker");
          return;
        }
        if (unanswered.length === 0) {
          setQuestions(qs);
          setAlreadyDone(true);
          setPhase("done");
          return;
        }
        setQuestions(unanswered);
        setCurrentQ(0);
        setTimeLeft(ANSWER_SECONDS);
        setShowResult(false);
        setResults({});
        setTimedOutIds(new Set());
        setSelectedOpt(null);
        setPhase("playing");
        trackEvent("trivia_started", { level });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar la trivia.");
        setPhase("picker");
      });
    return () => { alive = false; };
  }, [phase, level]);

  /* ── Timer tick ────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "playing" || showResult || answering || questions.length === 0) return;
    if (timeLeft <= 0) {
      if (!blockTimer.current) {
        blockTimer.current = true;
        void handleTimeout();
      }
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
  });

  /* ── Auto-advance after result ─────────────────────────── */
  useEffect(() => {
    if (!showResult) return;
    const id = window.setTimeout(() => {
      setShowResult(false);
      setSelectedOpt(null);
      blockTimer.current = false;
      if (currentQ < questions.length - 1) {
        setCurrentQ((q) => q + 1);
        setTimeLeft(ANSWER_SECONDS);
      } else {
        setPhase("done");
      }
    }, 1900);
    return () => window.clearTimeout(id);
  }, [showResult, currentQ, questions.length]);

  /* ── Answer handler ────────────────────────────────────── */
  async function handleAnswer(optionId: string) {
    if (answering || showResult) return;
    setSelectedOpt(optionId);
    setAnswering(true);
    const q = questions[currentQ];
    try {
      const res = await answerTrivia(sessionId, q.id, optionId);
      setResults((prev) => ({ ...prev, [q.id]: res }));
      trackEvent("trivia_answered", { correct: res.correct, level });
    } catch {
      setResults((prev) => ({
        ...prev,
        [q.id]: { correct: false, points: 0, correctOption: q.options[0]?.id ?? "a", explanation: "" },
      }));
    }
    setAnswering(false);
    setShowResult(true);
  }

  /* ── Timeout handler ───────────────────────────────────── */
  async function handleTimeout() {
    const q = questions[currentQ];
    if (!q) return;
    setAnswering(true);
    setTimedOutIds((prev) => new Set([...prev, q.id]));
    try {
      const res = await answerTrivia(sessionId, q.id, "__timeout__");
      setResults((prev) => ({ ...prev, [q.id]: res }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [q.id]: { correct: false, points: 0, correctOption: q.options[0]?.id ?? "a", explanation: "" },
      }));
    }
    setAnswering(false);
    setShowResult(true);
  }

  useEffect(() => {
    if (phase !== "done") return;
    let alive = true;
    reload()
      .then(async () => {
        const [cycles, leagues] = await Promise.all([listCycles(), listMyLeagues()]);
        const today = caracasDateKey(new Date());
        const live = cycleContainingToday(cycles, today);
        const league = leagues[0];
        const board = await loadCycleBoard(live?.id ?? "lifetime", league?.id);
        if (!alive) return;
        setStanding({
          points: board.points,
          position: board.mine?.position ?? null,
          label: league ? league.name : live ? "el ranking global" : "el histórico",
        });
      })
      .catch(() => {
        if (alive) setStanding(null);
      });
    return () => {
      alive = false;
    };
  }, [phase, reload]);

  /* ── Derived ───────────────────────────────────────────── */
  const totalPts = Object.values(results).reduce((s, r) => s + (r.points ?? 0), 0);
  const correctCount = Object.values(results).filter((r) => r.correct).length;
  const lvl = LEVELS[level];

  /* ═══════════════════════════════════════════════════════
     PHASE: PICKER
  ═══════════════════════════════════════════════════════ */
  if (phase === "picker") {
    return (
      <div className="flex h-full flex-col">
        <div className="px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>
            Juégate el Tobo
          </p>
          <h2 className="text-[28px] font-extrabold tracking-tight">Trivia del día</h2>
          <p className="text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
            ¿En qué nivel compites hoy?
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {error && (
            <p className="mb-4 rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ background: "var(--t-card)" }}>
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {(Object.entries(LEVELS) as [TriviaLevel, LevelMeta][]).map(([key, info], i) => (
              <button
                key={key}
                type="button"
                onClick={() => pickLevel(key)}
                disabled={(() => {
                  const row = levels.find((item) => item.level === key);
                  return row?.status === "cooldown" && remainingMs(row.availableAt, skewMs, tick) > 0;
                })()}
                className="rounded-[24px] px-5 py-5 text-left transition-all duration-150 active:scale-[0.97]"
                style={{
                  backgroundColor: "var(--t-card)",
                  border: `2px solid ${key === level ? info.color : "var(--t-border)"}`,
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div className="flex items-start gap-4">
                  <IconChip icon={info.icon} color={info.color} size="lg" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[21px] font-extrabold">{info.label}</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                        style={{ background: `${info.color}22`, color: info.color }}
                      >
                        {info.sublabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--t-muted)" }}>
                      {info.desc}
                    </p>
                    <p className="mt-2 text-[13px] font-extrabold" style={{ color: info.color }}>
                      {info.pts}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>4 preguntas</span>
                  <span style={{ color: "var(--t-border)" }}>·</span>
                  <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                    <Clock className="h-3.5 w-3.5" /> {ANSWER_SECONDS} seg cada una
                  </span>
                  <span style={{ color: "var(--t-border)" }}>·</span>
                  <span className="text-[12px] font-extrabold" style={{ color: info.color }}>
                    {levelLine(levels.find((row) => row.level === key), skewMs, tick, checkingLevel === key)}
                  </span>
                  {key === level && (
                    <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: "var(--t-tint)", color: "var(--t-accent)" }}>
                      actual
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-5 text-center text-[12px] font-semibold" style={{ color: "var(--t-muted)" }}>
            Puedes cambiar de nivel cuando quieras.
          </p>
        </div>
        <TabBar />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: LOADING
  ═══════════════════════════════════════════════════════ */
  if (phase === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4"
          style={{ borderColor: "var(--t-border)", borderTopColor: "var(--t-accent)" }}
        />
        <p className="text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
          Preparando preguntas de {lvl.label}…
        </p>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: DONE
  ═══════════════════════════════════════════════════════ */
  if (phase === "done") {
    const pct = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
    const stars = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : 1;

    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-[max(2rem,env(safe-area-inset-top))]">
          {alreadyDone ? (
            /* Already answered today */
            <ToboCard className="text-center">
              <div className="flex justify-center">
                <IconChip icon={Check} color="#22C55E" size="lg" />
              </div>
              <h2 className="mt-3 text-[26px] font-extrabold">¡Ya jugaste hoy!</h2>
              <p className="mt-2 text-[15px] font-semibold" style={{ color: "var(--t-muted)" }}>
                Completaste las {questions.length} preguntas de {lvl.label}.
              </p>
              <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
                Vuelve mañana para nuevas preguntas.
              </p>
              {standing && (
                <p className="mt-3 text-[15px] font-extrabold">
                  Llevas {formato(standing.points)} pts
                  {standing.position ? ` · puesto #${standing.position} en ${standing.label}` : ""}
                </p>
              )}
              <div className="mt-8">
                <GoldCta icon={Play} onClick={() => navigate("/tobo")}>Volver al inicio</GoldCta>
              </div>
              <div className="mt-3">
                <GhostCta icon={RefreshCw} onClick={() => { localStorage.removeItem(LEVEL_KEY); setPhase("picker"); }}>
                  Cambiar nivel
                </GhostCta>
              </div>
            </ToboCard>
          ) : (
            /* Score screen */
            <div className="trivia-celebration rounded-[32px] px-6 py-8 text-center" style={{ backgroundColor: "var(--t-card)" }}>
              <div className="flex justify-center">
                <IconChip icon={Trophy} color="var(--t-accent)" size="lg" />
              </div>
              <h2 className="mt-3 text-[30px] font-extrabold">¡Trivia completa!</h2>
              <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--t-muted)" }}>
                Nivel {lvl.label}
              </p>

              {/* Stars */}
              <div className="mt-5 flex justify-center gap-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    className="trivia-star-in text-[32px] leading-none"
                    style={{ animationDelay: `${0.2 + i * 0.12}s`, opacity: i < stars ? 1 : 0.25 }}
                  >
                    ⭐
                  </span>
                ))}
              </div>

              {/* Stats */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: "var(--t-bg)" }}>
                  <p className="text-[32px] font-extrabold tabular-nums">
                    {correctCount}/{questions.length}
                  </p>
                  <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>correctas</p>
                </div>
                <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: "var(--t-bg)" }}>
                  <p className="text-[32px] font-extrabold tabular-nums" style={{ color: "var(--t-accent)" }}>
                    +{totalPts}
                  </p>
                  <p className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>puntos ganados</p>
                </div>
              </div>

              {/* Message */}
              {standing && (
                <p className="mt-4 text-[15px] font-extrabold">
                  Llevas {formato(standing.points)} pts
                  {standing.position ? ` · puesto #${standing.position} en ${standing.label}` : ` · ${standing.label}`}
                </p>
              )}

              <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--t-muted)" }}>
                {pct === 100
                  ? "¡Perfecto! Eres un crack del béisbol venezolano. 🏆"
                  : pct >= 75
                  ? "¡Muy bien! Estás en buen nivel."
                  : pct >= 50
                  ? "No estuvo mal. ¡Sigue practicando!"
                  : "Falta práctica, ¡pero volverás mañana más fuerte!"}
              </p>

              <div className="mt-6">
                <GoldCta icon={Play} onClick={() => navigate("/tobo")}>Volver al inicio</GoldCta>
              </div>
              <div className="mt-3">
                <GhostCta icon={RefreshCw} onClick={() => { localStorage.removeItem(LEVEL_KEY); setPhase("picker"); }}>
                  Cambiar nivel
                </GhostCta>
              </div>
            </div>
          )}
        </div>
        <TabBar />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     PHASE: PLAYING
  ═══════════════════════════════════════════════════════ */
  const q = questions[currentQ];
  if (!q) return null;

  const result = results[q.id];
  const isTimedOut = timedOutIds.has(q.id);
  const timerPct = Math.max(0, (timeLeft / ANSWER_SECONDS) * 100);
  const timerColor = timeLeft <= 2 ? "#E23B2F" : timeLeft <= 4 ? "#FF8A3C" : "var(--t-accent)";

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { localStorage.removeItem(LEVEL_KEY); setPhase("picker"); }}
            className="text-[22px] leading-none"
            aria-label="Cambiar nivel"
          >
            ←
          </button>
          <div className="flex flex-1 items-center gap-2">
            <IconChip icon={lvl.icon} color={lvl.color} size="sm" />
            <p className="text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
              {lvl.label}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[13px] font-extrabold tabular-nums"
            style={{ backgroundColor: "var(--t-card)", color: "var(--t-muted)" }}
          >
            {currentQ + 1} / {questions.length}
          </span>
        </div>

        {/* Timer bar */}
        <div className="mt-3 flex items-center gap-3">
          <div
            className="flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--t-border)", height: 7 }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${timerPct}%`,
                backgroundColor: timerColor,
                transition: showResult ? "none" : "width 1s linear, background-color 0.25s ease",
              }}
            />
          </div>
          <span
            className="w-6 shrink-0 text-right text-[14px] font-extrabold tabular-nums"
            style={{ color: timerColor }}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      {/* ── Question card ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div
          key={q.id}
          className="trivia-question-enter rounded-[28px] px-5 py-5"
          style={{ backgroundColor: "var(--t-card)" }}
        >
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em]"
              style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)" }}
            >
              {q.category}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold"
              style={{ backgroundColor: "var(--t-border)", color: "var(--t-muted)" }}
            >
              {q.difficulty}
            </span>
            <span className="ml-auto text-[13px] font-extrabold" style={{ color: "var(--t-accent)" }}>
              +{q.points} pts
            </span>
          </div>

          {/* Prompt */}
          <p className="mt-4 text-[20px] font-extrabold leading-snug">{q.prompt}</p>

          {/* Options or result */}
          {!showResult ? (
            <div className="mt-5 flex flex-col gap-2.5">
              {q.options.map((opt) => {
                const isSelected = selectedOpt === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={answering}
                    onClick={() => void handleAnswer(opt.id)}
                    className="min-h-[56px] rounded-2xl px-4 py-3 text-left text-[15px] font-extrabold transition-all duration-100 active:scale-[0.98] disabled:opacity-60"
                    style={{
                      backgroundColor: isSelected ? "var(--t-tint)" : "var(--t-bg)",
                      color: "var(--t-text)",
                      border: `2px solid ${isSelected ? "var(--t-accent)" : "var(--t-border)"}`,
                    }}
                  >
                    <span className="mr-2 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
                      {opt.id.toUpperCase()}.
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Result flash */
            <div className="mt-5">
              {isTimedOut && (
                <div
                  className="trivia-result-pop mb-3 rounded-2xl px-4 py-3 text-center"
                  style={{ backgroundColor: "#E23B2F1A" }}
                >
                  <p className="text-[20px] font-extrabold" style={{ color: "#E23B2F" }}>
                    ⏰ ¡Se acabó el tiempo!
                  </p>
                </div>
              )}

              {result && (
                <div
                  className="trivia-result-pop rounded-2xl px-4 py-4 text-center"
                  style={{ backgroundColor: result.correct ? "#22C55E1A" : "#E23B2F1A" }}
                >
                  <p
                    className="text-[24px] font-extrabold"
                    style={{ color: result.correct ? "#22C55E" : "#E23B2F" }}
                  >
                    {result.correct ? "¡Correcto! 🎯" : "Incorrecto ❌"}
                  </p>
                  {result.correct && (
                    <p className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--t-accent)" }}>
                      +{result.points} puntos
                    </p>
                  )}
                  {!result.correct && (
                    <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
                      Respuesta correcta:{" "}
                      <strong style={{ color: "var(--t-text)" }}>
                        {q.options.find((o) => o.id === result.correctOption)?.label ?? result.correctOption}
                      </strong>
                    </p>
                  )}
                </div>
              )}

              {result?.explanation && (
                <div
                  className="mt-3 rounded-2xl px-4 py-3"
                  style={{ backgroundColor: "var(--t-bg)" }}
                >
                  <p className="text-[13px] font-semibold leading-relaxed" style={{ color: "var(--t-muted)" }}>
                    💡 {result.explanation}
                  </p>
                </div>
              )}

              <p
                className="mt-4 text-center text-[12px] font-semibold"
                style={{ color: "var(--t-muted-light)" }}
              >
                {currentQ < questions.length - 1
                  ? "Siguiente pregunta en un momento…"
                  : "¡Eso es todo! Calculando resultado…"}
              </p>
            </div>
          )}
        </div>
      </div>

      <TabBar />
    </div>
  );
}
