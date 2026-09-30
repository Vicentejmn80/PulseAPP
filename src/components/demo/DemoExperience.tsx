import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { QrBlock } from "@/components/demo/QrBlock";
import { BackButton, PrimaryButton } from "@/components/ui/Buttons";
import {
  DEMO_DURATION_MS,
  beginSimulation,
  canStartSimulator,
  clockAt,
  experienceSummary,
  formatClock,
  venueQrPath,
} from "@/lib/demoMatch";
import { answerDemo, demoState, logDemo, startDemo, type DemoQuestionView, type DemoState } from "@/services/demoApi";
import { listTascas, savePrediction, scoreLine, type BaseballMatch, type Tasca } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";

function parseScore(value: string) {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  return Number(value);
}

function currentQuestion(questions: DemoQuestionView[], elapsed: number, dismissed: Set<string>) {
  return (
    [...questions]
      .sort((a, b) => a.atMs - b.atMs)
      .find((question) => {
      if (question.myOption || dismissed.has(question.id) || question.revealed) return false;
      const windowMs = question.tone === "quick" ? 22_000 : 50_000;
      return elapsed >= question.atMs && elapsed < question.atMs + windowMs;
    }) ?? null
  );
}

const emptyState: DemoState = {
  ok: true,
  status: "none",
  label: "SIMULACIÓN",
  startedAt: null,
  serverNow: null,
  events: [],
  questions: [],
  hits: 0,
  questionCount: 0,
  bonus: 0,
  finalHome: null,
  finalAway: null,
  finished: false,
};

export function DemoExperience({ match, onMatch }: { match: BaseballMatch; onMatch: (match: BaseballMatch) => void }) {
  const navigate = useNavigate();
  const { reload } = usePulse();
  const [winner, setWinner] = useState(match.prediction?.winner ?? "");
  const [home, setHome] = useState(match.prediction ? String(match.prediction.homeScore) : "");
  const [away, setAway] = useState(match.prediction ? String(match.prediction.awayScore) : "");
  const [state, setState] = useState<DemoState>(emptyState);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(() => Date.now());
  const [sponsors, setSponsors] = useState<Tasca[]>([]);
  const sync = useRef({ server: 0, local: 0 });
  const logged = useRef(new Set<string>());

  function remember(next: DemoState) {
    if (next.serverNow) sync.current = { server: Date.parse(next.serverNow), local: Date.now() };
    setState(next);
  }

  useEffect(() => {
    let alive = true;
    demoState(match.id)
      .then((next) => {
        if (alive) remember(next);
      })
      .catch(() => undefined);
    listTascas()
      .then((rows) => {
        if (alive) setSponsors(rows.filter((row) => row.roundPrize).slice(0, 2));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [match.id]);

  useEffect(() => {
    if (state.status === "none") return undefined;
    const id = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "live") return undefined;
    const id = window.setInterval(() => {
      demoState(match.id).then(remember).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(id);
  }, [match.id, state.status]);

  const started = state.startedAt ? Date.parse(state.startedAt) : 0;
  const elapsed = state.status === "none" || !started ? 0 : Math.max(0, sync.current.server - started + (tick - sync.current.local));
  const clock = clockAt(elapsed);
  const latest = state.events[state.events.length - 1];
  const score = latest ?? { home: 0, away: 0 };
  const question = state.status === "live" ? currentQuestion(state.questions, elapsed, dismissed) : null;
  const feedback = [...state.questions].reverse().find((item) => item.revealed && item.myOption && elapsed >= item.resolveMs && elapsed < item.resolveMs + 8_000);
  const saved = match.prediction;

  useEffect(() => {
    if (state.status !== "live") return;
    const key = `${match.id}:inning:${clock.inning}`;
    if (logged.current.has(key)) return;
    logged.current.add(key);
    void logDemo(match.id, "simulator_inning_started", key);
  }, [clock.inning, match.id, state.status]);

  useEffect(() => {
    if (!question) return;
    const key = `${match.id}:question:${question.id}`;
    if (logged.current.has(key)) return;
    logged.current.add(key);
    void logDemo(match.id, "simulator_question_shown", key);
  }, [match.id, question]);

  useEffect(() => {
    if (state.finished) void reload();
  }, [reload, state.finished]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const homeScore = parseScore(home);
    const awayScore = parseScore(away);
    if (!winner) {
      setError("Elige quién gana.");
      return;
    }
    if (homeScore === null || awayScore === null) {
      setError("El marcador tiene que ser un número entero entre 0 y 99.");
      return;
    }
    if (homeScore === awayScore) {
      setError("En béisbol no se predice empate.");
      return;
    }
    if ((homeScore > awayScore && winner !== match.homeTeam) || (awayScore > homeScore && winner !== match.awayTeam)) {
      setError("El ganador no coincide con el marcador.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await savePrediction({ matchId: match.id, winner, homeScore, awayScore });
      onMatch({
        ...match,
        prediction: {
          id: match.prediction?.id ?? "local",
          winner,
          homeScore,
          awayScore,
          lockedAt: null,
          processed: false,
          winnerPoints: null,
          closenessPoints: null,
          total: null,
          errorTotal: null,
        },
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  }

  async function onPlay() {
    if (beginSimulation(canStartSimulator(saved) ? "ready" : "predict") !== "live") return;
    setPending(true);
    setError("");
    try {
      remember(await startDemo(match.id));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo empezar.");
    } finally {
      setPending(false);
    }
  }

  async function choose(optionId: string) {
    if (!question) return;
    setPending(true);
    try {
      remember(await answerDemo(match.id, question.id, optionId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo responder.");
    } finally {
      setPending(false);
    }
  }

  const summary = state.finished && saved && state.finalHome !== null && state.finalAway !== null
    ? experienceSummary({
        predHome: saved.homeScore,
        predAway: saved.awayScore,
        simHome: state.finalHome,
        simAway: state.finalAway,
        hits: state.hits,
      })
    : null;
  const bonus = state.finished ? state.bonus : summary?.bonus ?? 0;
  const experienceTotal = summary ? summary.prediction.total + bonus : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Experiencia demo</p>
          <h2 className="text-[20px] font-extrabold tracking-tight">Simulación</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        {state.status === "none" && (
          <form onSubmit={onSave} className="rounded-[28px] bg-white px-5 py-5">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Pronóstico oficial</p>
            <h3 className="mt-2 text-[28px] font-extrabold leading-tight">{match.awayTeam}</h3>
            <p className="text-[14px] font-extrabold text-[#A08B80]">vs.</p>
            <h3 className="text-[28px] font-extrabold leading-tight">{match.homeTeam}</h3>
            <p className="mt-3 text-[13px] font-semibold text-[#8D7366]">Esto queda guardado como tu pronóstico. El juego que sigue es una simulación, no el resultado de la LVBP.</p>
            <p className="mb-2 mt-5 text-[14px] font-extrabold">¿Quién gana?</p>
            <div className="grid grid-cols-2 gap-2">
              {[match.awayTeam, match.homeTeam].map((team) => (
                <button key={team} type="button" onClick={() => setWinner(team)} className={`min-h-12 rounded-2xl px-2 py-2 text-[14px] font-extrabold ${winner === team ? "bg-[#FF4F1A] text-white" : "bg-[#FFF1EA] text-[#241710]"}`}>
                  {team}
                </button>
              ))}
            </div>
            <p className="mb-2 mt-5 text-[14px] font-extrabold">Predice el marcador</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] font-extrabold text-[#A08B80]">
                {match.awayTeam}
                <input inputMode="numeric" value={away} onChange={(event) => setAway(event.target.value)} className="mt-1 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[18px] font-extrabold text-[#241710] outline-none" />
              </label>
              <label className="text-[12px] font-extrabold text-[#A08B80]">
                {match.homeTeam}
                <input inputMode="numeric" value={home} onChange={(event) => setHome(event.target.value)} className="mt-1 h-12 w-full rounded-2xl bg-[#FFF7F1] px-3 text-[18px] font-extrabold text-[#241710] outline-none" />
              </label>
            </div>
            {saved && <p className="mt-4 text-[16px] font-extrabold">Tu pronóstico: {scoreLine(match, saved.homeScore, saved.awayScore)}</p>}
            <div className="mt-4">
              <PrimaryButton type="submit" disabled={pending}>{saved ? "Actualizar pronóstico" : "Guardar pronóstico"}</PrimaryButton>
            </div>
            <div className="mt-3">
              <button type="button" disabled={!canStartSimulator(saved) || pending} onClick={() => void onPlay()} className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#241710] text-[17px] font-extrabold text-white disabled:opacity-40">
                ⚾ PLAY BALL
              </button>
            </div>
          </form>
        )}

        {state.status !== "none" && !state.finished && (
          <section className="rounded-[28px] bg-[#241710] px-5 py-5 text-white">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF8A3C]">Inning {clock.inning}</p>
              <p className="text-[28px] font-extrabold tabular-nums">{formatClock(clock.remainingMs)}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[13px] font-bold text-white/60">{match.awayTeam}</p>
                <p className="text-[40px] font-extrabold leading-none tabular-nums">{score.away}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-bold text-white/60">{match.homeTeam}</p>
                <p className="text-[40px] font-extrabold leading-none tabular-nums">{score.home}</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#FF4F1A]" style={{ width: `${Math.round(clock.progress * 100)}%` }} />
            </div>
            <p className="mt-4 min-h-12 text-[16px] font-extrabold leading-snug live-event-in">{latest?.text || "Play ball. La simulación está por abrir el primer inning."}</p>
            <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">{latest?.half === "baja" ? "Mitad baja" : "Mitad alta"} · simulación</p>
          </section>
        )}

        {state.status === "live" && (
          <section className="mt-3 rounded-[24px] bg-white px-4 py-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Aciertos</p>
                <p className="text-[28px] font-extrabold leading-none tabular-nums">{state.hits}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Preguntas</p>
                <p className="text-[18px] font-extrabold tabular-nums">{state.hits} / {state.questionCount}</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#FFF1EA]">
              <div className="h-full rounded-full bg-[#FF4F1A]" style={{ width: `${state.questionCount ? Math.round((state.hits / state.questionCount) * 100) : 0}%` }} />
            </div>
          </section>
        )}

        {question && (
          <section className="mt-3 rounded-[24px] bg-white px-4 py-4">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{question.tone === "quick" ? "Momento rápido" : "Momento del juego"}</p>
            <p className="mt-2 text-[18px] font-extrabold leading-snug">{question.prompt}</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {question.options.map((option) => (
                <button key={option.id} type="button" disabled={pending} onClick={() => void choose(option.id)} className="min-h-12 rounded-2xl bg-[#FFF1EA] px-3 text-[14px] font-extrabold text-[#241710] disabled:opacity-40">
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDismissed((current) => new Set(current).add(question.id))} className="mt-3 text-[13px] font-extrabold text-[#8D7366]">
              Seguir el partido
            </button>
          </section>
        )}

        {feedback && (
          <p className={`mt-3 rounded-2xl px-4 py-3 text-[16px] font-extrabold ${feedback.hit ? "bg-[#241710] text-white" : "bg-white text-[#8D7366]"}`}>
            {feedback.hit ? "¡ACERTASTE!" : "No fue esta vez."}
          </p>
        )}

        {state.finished && summary && saved && (
          <section className="rounded-[28px] bg-white px-5 py-5">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F1A]">Simulación</p>
            <h3 className="mt-1 text-[28px] font-extrabold">Partido terminado</h3>
            <p className="mt-3 text-[32px] font-extrabold tabular-nums">{match.awayTeam} {state.finalAway}</p>
            <p className="text-[32px] font-extrabold tabular-nums">{match.homeTeam} {state.finalHome}</p>
            <p className="mt-4 text-[14px] font-semibold text-[#8D7366]">Tu pronóstico</p>
            <p className="text-[18px] font-extrabold">{scoreLine(match, saved.homeScore, saved.awayScore)}</p>
            <p className="mt-3 text-[16px] font-extrabold">Predicción principal: {summary.prediction.winnerCorrect ? "Correcta" : "No acertó al ganador"}</p>
            <p className="mt-2 text-[16px] font-extrabold">Momentos del juego: {state.hits} / {state.questionCount} acertados</p>
            <p className="mt-4 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Pronóstico contra esta simulación</p>
            <p className="text-[22px] font-extrabold">+{summary.prediction.total} PT</p>
            <p className="mt-3 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Bonus de experiencia</p>
            <p className="text-[22px] font-extrabold">+{bonus} PT</p>
            <p className="mt-3 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#FF4F1A]">Total de esta experiencia</p>
            <p className="text-[32px] font-extrabold">+{experienceTotal} PT</p>
            <p className="mt-3 text-[13px] font-semibold text-[#8D7366]">El bonus entra a tu cuenta. El marcador de arriba es el resultado de la simulación y no cambia el resultado oficial del partido.</p>
            <p className="mt-2 text-[12px] font-bold text-[#A08B80]">Duración de la experiencia: {Math.round(DEMO_DURATION_MS / 60000)} minutos.</p>
          </section>
        )}

        {sponsors.length > 0 && (
          <section className="mt-3 rounded-[24px] bg-white px-4 py-4">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Premios de esta experiencia</p>
            <div className="mt-3 flex flex-col gap-3">
              {sponsors.map((sponsor) => (
                <button key={sponsor.id} type="button" onClick={() => sponsor.slug && navigate(venueQrPath(sponsor.slug))} className="flex items-center gap-3 text-left">
                  {sponsor.logoUrl ? <img src={sponsor.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1EA] text-[18px]">🍻</span>}
                  <span>
                    <span className="block text-[15px] font-extrabold">{sponsor.name}</span>
                    <span className="block text-[13px] font-semibold text-[#8D7366]">{sponsor.roundPrize}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {state.finished && sponsors[0]?.slug && (
          <div className="mt-3">
            <QrBlock value={`${window.location.origin}${venueQrPath(sponsors[0].slug)}`} title={`QR de ${sponsors[0].name}`} />
          </div>
        )}
      </div>
    </div>
  );
}
