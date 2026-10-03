import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCoin } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { listMatches, listRanking, matchPhase, type BaseballMatch } from "@/services/matchesApi";
import { myPrizes, type ToboPrize } from "@/services/matchesApi";
import { myStats, trackEvent } from "@/services/analytics";
import { todayTrivia } from "@/services/triviaApi";
import { usePulse } from "@/state/PulseContext";

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-VE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Caracas",
  });
}

export function HomePage() {
  const navigate = useNavigate();
  const { totalPoints, reload } = usePulse();
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [position, setPosition] = useState<number | null>(null);
  const [cyclePoints, setCyclePoints] = useState(0);
  const [triviaAnsweredCount, setTriviaAnsweredCount] = useState(0);
  const [triviaTotal, setTriviaTotal] = useState(0);
  const [prizes, setPrizes] = useState<ToboPrize[]>([]);
  const [stats, setStats] = useState({ predictionsMade: 0, triviaCorrect: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    function load() {
      Promise.all([reload(), listMatches(), listRanking("ronda_1"), todayTrivia(), myPrizes(), myStats()])
        .then(([, matchRows, ranking, trivia, prizeStatus, userStats]) => {
          if (!alive) return;
          setMatches(matchRows);
          const mine = ranking.find((entry) => entry.isCurrentUser);
          setPosition(mine?.position ?? null);
          setCyclePoints(mine?.points ?? 0);
          setTriviaAnsweredCount(trivia.answeredCount);
          setTriviaTotal(trivia.questions.length);
          setPrizes(prizeStatus.prizes ?? []);
          setStats(userStats);
        })
        .catch((reason: unknown) => {
          if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la jornada.");
        });
    }
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [reload]);

  const real = matches.filter((match) => !match.simulation && !match.demo);
  const upcoming = real.filter((match) => matchPhase(match) === "open" || matchPhase(match) === "locked");
  const next = upcoming[0] ?? real.find((match) => match.status !== "cancelled");
  const pendingPredictions = real.filter((match) => matchPhase(match) === "open" && !match.prediction).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F1A]">Temporada LVBP 2026-27</p>
          <h1 className="text-[22px] font-extrabold leading-none tracking-tight">Juégate el Tobo</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate("/tobo/profile")}
          className="flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-[0_6px_16px_rgba(80,40,10,0.08)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFC53D] text-[#8A4E00]">
            <IconCoin className="h-4 w-4" />
          </span>
          <span className="text-[13px] font-extrabold tabular-nums">{formato(totalPoints)}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        <p className="mb-3 text-[14px] font-semibold text-[#8D7366]">Tu temporada. Tus pronosticos. Tu ranking.</p>

        {/* MI SEMANA */}
        <div className="mb-3 rounded-[28px] bg-white p-5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Mi semana</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#FFF1EA] p-3">
              <p className="text-[22px] font-extrabold">{pendingPredictions}</p>
              <p className="text-[12px] font-bold text-[#8D7366]">pronosticos pendientes</p>
            </div>
            <div className="rounded-2xl bg-[#FFF1EA] p-3">
              <p className="text-[22px] font-extrabold">{triviaAnsweredCount}/{triviaTotal || 2}</p>
              <p className="text-[12px] font-bold text-[#8D7366]">trivias respondidas</p>
            </div>
            <div className="rounded-2xl bg-[#FFF1EA] p-3">
              <p className="text-[22px] font-extrabold">#{position ?? "-"}</p>
              <p className="text-[12px] font-bold text-[#8D7366]">del ranking</p>
            </div>
            <div className="rounded-2xl bg-[#FFF1EA] p-3">
              <p className="text-[22px] font-extrabold">{prizes.length}</p>
              <p className="text-[12px] font-bold text-[#8D7366]">premios ganados</p>
            </div>
          </div>
        </div>

        {/* PRÓXIMO JUEGO */}
        {next ? (
          <button
            type="button"
            onClick={() => {
              trackEvent("venue_viewed", { from: "home_next_match", matchId: next.id });
              navigate(`/tobo/partidos/${next.id}`);
            }}
            className="mb-3 w-full rounded-[28px] bg-gradient-to-br from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C] p-4 text-left text-white shadow-[0_16px_32px_rgba(255,79,26,0.28)]"
          >
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/80">Proximo juego</p>
            <h2 className="mt-2 text-[24px] font-extrabold leading-tight">{next.awayTeam}</h2>
            <p className="text-[13px] font-bold text-white/80">visitante</p>
            <p className="mt-1 text-[14px] font-extrabold text-white/80">vs.</p>
            <h2 className="text-[24px] font-extrabold leading-tight">{next.homeTeam}</h2>
            <p className="text-[13px] font-bold text-white/80">local</p>
            <p className="mt-3 text-[14px] font-bold">{when(next.startsAt)}</p>
            {next.prediction ? (
              <p className="mt-2 text-[14px] font-extrabold">Pronostico guardado: {next.prediction.awayScore} - {next.prediction.homeScore}</p>
            ) : null}
            <span className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-white text-[16px] font-extrabold text-[#FF4F1A]">
              {next.prediction ? "Ver pronostico" : "Pronosticar"}
            </span>
          </button>
        ) : (
          <div className="mb-3 rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">Todavia no hay partidos</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Cuando se publique uno, vas a poder predecir.</p>
          </div>
        )}

        {/* TRIVIA DEL DÍA */}
        <button
          type="button"
          onClick={() => navigate("/tobo/trivias")}
          className="mb-3 w-full rounded-[28px] bg-[#241710] p-4 text-left text-white shadow-[0_16px_32px_rgba(36,23,16,0.25)]"
        >
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF8A3C]">Trivia del día</p>
            {triviaTotal > 0 && (
              <span className="rounded-full bg-[#FF4F1A]/20 px-2.5 py-1 text-[12px] font-extrabold text-[#FF8A3C]">
                {triviaAnsweredCount}/{triviaTotal}
              </span>
            )}
          </div>
          <p className="mt-2 text-[15px] font-semibold text-white/80">
            {triviaTotal === 0
              ? "Hoy no hay trivia disponible. Vuelve mañana."
              : triviaAnsweredCount === triviaTotal
                ? `¡Completaste las ${triviaTotal} preguntas de hoy!`
                : `${triviaTotal - triviaAnsweredCount} pregunta${triviaTotal - triviaAnsweredCount !== 1 ? "s" : ""} pendiente${triviaTotal - triviaAnsweredCount !== 1 ? "s" : ""}. Responde y gana puntos.`}
          </p>
          <span className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-[#FF4F1A] text-[15px] font-extrabold uppercase tracking-wide text-white">
            {triviaAnsweredCount < triviaTotal ? "Jugar trivia" : "Ver trivia"}
          </span>
        </button>

        {/* MI POSICIÓN */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => navigate("/tobo/ranking")} className="rounded-[22px] bg-white px-3 py-3 text-left">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A08B80]">Ronda 1</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums">{formato(cyclePoints)}</p>
            <p className="text-[12px] font-bold text-[#8D7366]">puntos del ciclo</p>
          </button>
          <button type="button" onClick={() => navigate("/tobo/ranking")} className="rounded-[22px] bg-white px-3 py-3 text-left">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A08B80]">Ranking</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums">#{position ?? "—"}</p>
            <p className="text-[12px] font-bold text-[#8D7366]">tu posicion</p>
          </button>
        </div>

        {/* PREMIOS DE ESTA SEMANA */}
        <div className="mb-3 rounded-[28px] bg-white p-4 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Premios de esta semana</p>
            <button type="button" onClick={() => navigate("/tobo/premios")} className="text-[12px] font-extrabold text-[#A08B80]">
              Ver todos
            </button>
          </div>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Cada semana hay premios de las tascas.</p>
          {prizes.slice(0, 2).map((prize) => (
            <div key={prize.id} className="mt-2 rounded-2xl bg-[#FFF1EA] p-3">
              <p className="text-[14px] font-extrabold">{prize.cycleName}</p>
              <p className="text-[13px] font-semibold text-[#8D7366]">Puesto {prize.rank} · {prize.status}</p>
            </div>
          ))}
          {prizes.length === 0 && <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">Aun no tienes premios. Sube en el ranking.</p>}
        </div>

        {/* ACTIVIDAD RÁPIDA */}
        <button
          type="button"
          onClick={() => navigate("/tobo/mi-quiniela")}
          className="w-full rounded-[22px] bg-white px-4 py-4 text-left"
        >
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Tu actividad</p>
          <p className="mt-1 text-[16px] font-extrabold">
            {stats.predictionsMade} pronosticos · {stats.triviaCorrect} trivias acertadas
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Revisa tu quiniela completa.</p>
        </button>
      </div>
      <TabBar />
    </div>
  );
}
