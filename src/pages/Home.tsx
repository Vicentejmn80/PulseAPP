import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCoin } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { HomeExtras } from "@/components/tobo/PilotExtras";
import { formato } from "@/lib/format";
import { listMatches, listRanking, matchPhase, type BaseballMatch } from "@/services/matchesApi";
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
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listMatches(), listRanking("ronda_1")])
      .then(([, rows, ranking]) => {
        if (!alive) return;
        setMatches(rows);
        const mine = ranking.find((entry) => entry.isCurrentUser);
        setPosition(mine?.position ?? null);
        setCyclePoints(mine?.points ?? 0);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la jornada.");
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  const real = matches.filter((match) => !match.simulation);
  const live = real.find((match) => match.status === "in_progress");
  const upcoming = real.filter((match) => matchPhase(match) === "open" || matchPhase(match) === "locked");
  const next = live ?? upcoming[0] ?? real.find((match) => match.status !== "cancelled");
  const rest = upcoming.filter((match) => match.id !== next?.id).slice(0, 3);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F1A]">Octubre 2026</p>
          <h1 className="text-[22px] font-extrabold leading-none tracking-tight">Juégate el Tobo</h1>
        </div>
        <button type="button" onClick={() => navigate("/profile")} className="flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-[0_6px_16px_rgba(80,40,10,0.08)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFC53D] text-[#8A4E00]">
            <IconCoin className="h-4 w-4" />
          </span>
          <span className="text-[13px] font-extrabold tabular-nums">{formato(totalPoints)}</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        {next ? (
          <button type="button" onClick={() => navigate(`/partidos/${next.id}`)} className="w-full rounded-[28px] bg-gradient-to-br from-[#FF8A3C] via-[#FF4F1A] to-[#E8360C] p-4 text-left text-white shadow-[0_16px_32px_rgba(255,79,26,0.28)]">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/80">{live ? "En vivo" : "Próximo juego"}</p>
            <h2 className="mt-2 text-[22px] font-extrabold leading-tight">{next.awayTeam}</h2>
            <p className="text-[13px] font-bold text-white/80">visitante</p>
            <p className="mt-2 text-[13px] font-extrabold text-white/80">vs.</p>
            <h2 className="text-[22px] font-extrabold leading-tight">{next.homeTeam}</h2>
            <p className="text-[13px] font-bold text-white/80">local</p>
            <p className="mt-3 text-[14px] font-bold">{when(next.startsAt)}</p>
            <span className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-white text-[16px] font-extrabold text-[#FF4F1A]">
              {live ? "Ver en vivo" : next.prediction ? "Ver pronóstico" : "Pronosticar"}
            </span>
          </button>
        ) : (
          !error && <p className="rounded-[28px] bg-white px-5 py-8 text-center text-[15px] font-extrabold">Cargando la jornada de octubre…</p>
        )}

        <div className="mt-3">
          <HomeExtras />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => navigate("/ranking")} className="rounded-[22px] bg-white px-3 py-3 text-left">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A08B80]">Ronda 1</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums">{formato(cyclePoints)}</p>
            <p className="text-[12px] font-bold text-[#8D7366]">puntos del ciclo</p>
          </button>
          <button type="button" onClick={() => navigate("/ranking")} className="rounded-[22px] bg-white px-3 py-3 text-left">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A08B80]">Ranking</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums">#{position ?? "—"}</p>
            <p className="text-[12px] font-bold text-[#8D7366]">tu posición</p>
          </button>
        </div>

        <div className="mb-2 mt-5 flex items-center justify-between px-1">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#A08B80]">Próximos juegos</p>
          <button type="button" onClick={() => navigate("/partidos")} className="text-[12px] font-extrabold text-[#FF4F1A]">Ver todos</button>
        </div>
        <div className="flex flex-col gap-2">
          {rest.map((match) => (
            <button key={match.id} type="button" onClick={() => navigate(`/partidos/${match.id}`)} className="rounded-[22px] bg-white px-4 py-3 text-left">
              <p className="text-[15px] font-extrabold">{match.awayTeam}</p>
              <p className="text-[13px] font-bold text-[#8D7366]">en casa de {match.homeTeam}</p>
              <p className="mt-1 text-[12px] font-semibold text-[#A08B80]">{when(match.startsAt)}</p>
            </button>
          ))}
        </div>

        <button type="button" onClick={() => navigate("/tascas")} className="mt-4 w-full rounded-[22px] bg-white px-4 py-4 text-left">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Tascas</p>
          <p className="mt-1 text-[16px] font-extrabold">Dónde se vive el juego</p>
          <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">La red de tascas del piloto.</p>
        </button>
      </div>
      <TabBar />
    </div>
  );
}
