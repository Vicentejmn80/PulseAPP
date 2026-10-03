import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TabBar } from "@/components/ui/TabBar";
import { trackEvent } from "@/services/analytics";
import {
  answerTrivia,
  todayTrivia,
  type TriviaLevel,
  type TriviaQuestion,
  type TriviaResult,
} from "@/services/triviaApi";

/* ─── Level meta ─────────────────────────────────────────── */
type Phase = "picker" | "loading" | "playing" | "done";

interface LevelMeta {
  emoji: string;
  label: string;
  sublabel: string;
  desc: string;
  pts: string;
  color: string;
}
const LEVELS: Record<TriviaLevel, LevelMeta> = {
  beginner: {
    emoji: "🏃",
    label: "Principiante",
    sublabel: "Fácil",
    desc: "Reglas básicas y equipos de la LVBP. El punto de partida.",
    pts: "+5 pts por pregunta",
    color: "#22C55E",
  },
  intermediate: {
    emoji: "⚾",
    label: "Intermedio",
    sublabel: "Medio",
    desc: "Jugadores venezolanos y Grandes Ligas. Un reto real.",
    pts: "+10 pts por pregunta",
    color: "#FFC94A",
  },
  advanced: {
    emoji: "🏆",
    label: "Avanzado",
    sublabel: "Difícil",
    desc: "Historia, estadísticas y récords. Solo los que saben.",
    pts: "+15 pts por pregunta",
    color: "#E23B2F",
  },
};
const LEVEL_KEY = "tobo-trivia-level";

/* ─── Component ──────────────────────────────────────────── */
export function TriviaPage() {
  const navigate = useNavigate();

  const stored = localStorage.getItem(LEVEL_KEY) as TriviaLevel | null;
  const [level, setLevel] = useState<TriviaLevel>(stored ?? "beginner");
  const [phase, setPhase] = useState<Phase>(stored ? "loading" : "picker");

  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState<Record<string, TriviaResult>>({});
  const [timedOutIds, setTimedOutIds] = useState<Set<string>>(new Set());
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const [alreadyDone, setAlreadyDone] = useState(false);

  const blockTimer = useRef(false);

  /* ── Pick level and start ──────────────────────────────── */
  function pickLevel(l: TriviaLevel) {
    localStorage.setItem(LEVEL_KEY, l);
    setLevel(l);
    setAlreadyDone(false);
    setPhase("loading");
  }

  /* ── Load questions ────────────────────────────────────── */
  useEffect(() => {
    if (phase !== "loading") return;
    blockTimer.current = false;
    let alive = true;
    setError("");
    todayTrivia(level)
      .then(({ questions: qs }) => {
        if (!alive) return;
        const unanswered = qs.filter((q) => !q.answered);
        if (qs.length === 0) {
          setError("No hay preguntas para este nivel hoy. Vuelve mañana.");
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
        setTimeLeft(10);
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
        setTimeLeft(10);
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
      const res = await answerTrivia(q.id, optionId);
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
      const res = await answerTrivia(q.id, "__timeout__");
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
          <h2 className="text-[28px] font-extrabold tracking-tight">Trivia del día ⚾</h2>
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
                className="rounded-[24px] px-5 py-5 text-left transition-all duration-150 active:scale-[0.97]"
                style={{
                  backgroundColor: "var(--t-card)",
                  border: `2px solid ${key === level ? info.color : "var(--t-border)"}`,
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 text-[42px] leading-none">{info.emoji}</span>
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
                  <span className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>⏱ 10 seg cada una</span>
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
            <div className="trivia-celebration rounded-[32px] px-6 py-10 text-center" style={{ backgroundColor: "var(--t-card)" }}>
              <p className="text-[56px]">✅</p>
              <h2 className="mt-3 text-[26px] font-extrabold">¡Ya jugaste hoy!</h2>
              <p className="mt-2 text-[15px] font-semibold" style={{ color: "var(--t-muted)" }}>
                Completaste las {questions.length} preguntas de {lvl.label}.
              </p>
              <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--t-muted)" }}>
                Vuelve mañana para nuevas preguntas.
              </p>
              <button
                type="button"
                onClick={() => navigate("/tobo")}
                className="mt-8 h-14 w-full rounded-2xl text-[16px] font-extrabold"
                style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
              >
                Volver al inicio
              </button>
              <button
                type="button"
                onClick={() => { localStorage.removeItem(LEVEL_KEY); setPhase("picker"); }}
                className="mt-3 h-12 w-full rounded-2xl text-[14px] font-extrabold"
                style={{ backgroundColor: "var(--t-border)", color: "var(--t-text)" }}
              >
                Cambiar nivel
              </button>
            </div>
          ) : (
            /* Score screen */
            <div className="trivia-celebration rounded-[32px] px-6 py-8 text-center" style={{ backgroundColor: "var(--t-card)" }}>
              <p className="text-[64px] leading-none">🎉</p>
              <h2 className="mt-3 text-[30px] font-extrabold">¡Trivia completa!</h2>
              <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--t-muted)" }}>
                {lvl.emoji} Nivel {lvl.label}
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
              <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--t-muted)" }}>
                {pct === 100
                  ? "¡Perfecto! Eres un crack del béisbol venezolano. 🏆"
                  : pct >= 75
                  ? "¡Muy bien! Estás en buen nivel."
                  : pct >= 50
                  ? "No estuvo mal. ¡Sigue practicando!"
                  : "Falta práctica, ¡pero volverás mañana más fuerte!"}
              </p>

              <button
                type="button"
                onClick={() => navigate("/tobo")}
                className="mt-6 h-14 w-full rounded-2xl text-[16px] font-extrabold transition-transform active:scale-[0.97]"
                style={{ backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }}
              >
                Volver al inicio
              </button>
              <button
                type="button"
                onClick={() => { localStorage.removeItem(LEVEL_KEY); setPhase("picker"); }}
                className="mt-3 h-12 w-full rounded-2xl text-[14px] font-extrabold"
                style={{ backgroundColor: "var(--t-border)", color: "var(--t-text)" }}
              >
                Cambiar nivel
              </button>
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
  const timerPct = Math.max(0, (timeLeft / 10) * 100);
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
            <span className="text-[18px] leading-none">{lvl.emoji}</span>
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
