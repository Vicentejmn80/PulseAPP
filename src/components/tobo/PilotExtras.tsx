import { useCallback, useEffect, useState } from "react";
import { answerLive, homeBoard, matchBoard, type HomeBoard, type LiveQuestion } from "@/services/mechanicsApi";

function useEvery(load: () => void) {
  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);
}

export function Countdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!until) return null;
  const left = new Date(until).getTime() - now;
  if (left <= 0) return <span>Cerrada</span>;
  const total = Math.floor(left / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return <span className="tabular-nums">{minutes}:{seconds}</span>;
}

export function StreakBadge({ streak }: { streak: HomeBoard["streak"] | null }) {
  if (!streak) return null;
  return (
    <div className="rounded-[22px] bg-white px-4 py-3">
      <p className="text-[20px] font-extrabold">🔥 {streak.length}</p>
      <p className="text-[12px] font-bold text-[#8D7366]">{streak.length === 1 ? "día de racha" : "días de racha"}</p>
      {streak.nextDays != null && streak.nextPoints != null && (
        <p className="mt-1 text-[13px] font-extrabold text-[#FF4F1A]">Te faltan {streak.nextDays} días para +{streak.nextPoints} pts</p>
      )}
    </div>
  );
}

function LiveCard({ question, onAnswered }: { question: LiveQuestion; onAnswered: () => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const resolved = question.status === "resolved" || question.status === "void";
  const mine = question.options.find((option) => option.id === question.myOption);

  async function choose(optionId: string) {
    setPending(true);
    setError("");
    try {
      await answerLive(question.id, optionId);
      onAnswered();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo responder.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[24px] bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#E23B2F]">En vivo</p>
        {question.status === "open" && question.closesAt && <p className="text-[13px] font-extrabold"><Countdown until={question.closesAt} /></p>}
      </div>
      <p className="mt-1 text-[12px] font-bold text-[#A08B80]">{question.awayTeam} en {question.homeTeam}</p>
      <h3 className="mt-2 text-[18px] font-extrabold leading-tight">{question.prompt}</h3>
      {question.status === "open" && !question.myOption && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {question.options.map((option) => (
            <button key={option.id} type="button" disabled={pending} onClick={() => void choose(option.id)} className="min-h-12 rounded-2xl bg-[#FFF1EA] px-2 py-2 text-[13px] font-extrabold leading-tight disabled:opacity-40">
              {option.label}
            </button>
          ))}
        </div>
      )}
      {question.myOption && !resolved && <p className="mt-3 text-[14px] font-extrabold">Respuesta guardada: {mine?.label}</p>}
      {question.status === "resolved" && (
        <p className="mt-3 text-[15px] font-extrabold text-[#FF4F1A]">
          {question.myOption && question.myOption === question.correctOption ? `Acertaste · +${question.points ?? question.livePoints} pts` : "Esta vez no sumó"}
        </p>
      )}
      {question.status === "void" && <p className="mt-3 text-[14px] font-bold text-[#8D7366]">Esta pregunta se anuló. No da puntos.</p>}
      {question.status === "closed" && <p className="mt-3 text-[14px] font-bold text-[#8D7366]">Pregunta cerrada. Esperamos el resultado.</p>}
      {error && <p className="mt-2 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
    </section>
  );
}

export function StreakPanel() {
  const [streak, setStreak] = useState<HomeBoard["streak"] | null>(null);
  const load = useCallback(() => {
    homeBoard().then((board) => setStreak(board.streak)).catch(() => undefined);
  }, []);
  useEvery(load);
  return <StreakBadge streak={streak} />;
}

export function HomeExtras() {
  const [board, setBoard] = useState<HomeBoard | null>(null);
  const load = useCallback(() => {
    homeBoard().then(setBoard).catch(() => undefined);
  }, []);
  useEvery(load);
  if (!board) return null;
  const pleno = board.pleno;
  return (
    <div className="mb-3 flex flex-col gap-2">
      <StreakBadge streak={board.streak} />
      {pleno.show && (
        <div className="rounded-[22px] bg-white px-4 py-3">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Pleno de hoy</p>
          <p className="mt-1 text-[16px] font-extrabold">{pleno.correct ?? 0} de {pleno.games} acertados</p>
          {pleno.awarded && <p className="text-[13px] font-extrabold text-[#FF4F1A]">Pleno logrado · +{pleno.bonus} pts</p>}
          {!pleno.awarded && pleno.possible && <p className="text-[13px] font-extrabold text-[#FF4F1A]">Pleno posible</p>}
        </div>
      )}
      {board.live.filter((question) => question.status === "open" || question.myOption).slice(0, 2).map((question) => (
        <LiveCard key={question.id} question={question} onAnswered={load} />
      ))}
    </div>
  );
}

export function MatchExtras({ matchId }: { matchId: string }) {
  const [live, setLive] = useState<LiveQuestion[]>([]);
  const load = useCallback(() => {
    matchBoard(matchId).then((board) => {
      setLive(board.live ?? []);
    }).catch(() => undefined);
  }, [matchId]);
  useEvery(load);

  if (live.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {live.map((question) => <LiveCard key={question.id} question={question} onAnswered={load} />)}
    </div>
  );
}
