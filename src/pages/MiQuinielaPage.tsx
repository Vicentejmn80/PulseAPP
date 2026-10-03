import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { TabBar } from "@/components/ui/TabBar";
import { listMatches, matchPhase, scoreLine, type BaseballMatch } from "@/services/matchesApi";

function whenDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "America/Caracas",
  });
}

function whenTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });
}

type Tab = "semana" | "proximos" | "finalizados";

function statusInfo(match: BaseballMatch) {
  const phase = matchPhase(match);
  if (phase === "cancelled" || match.status === "cancelled") return { label: "Cancelado", tone: "muted" as const };
  if (match.status === "postponed") return { label: "Pospuesto", tone: "muted" as const };
  if (phase === "finished") return { label: "Finalizado", tone: "done" as const };
  if (phase === "live") return { label: "En vivo", tone: "live" as const };
  if (phase === "locked") return { label: "Pronostico cerrado", tone: "locked" as const };
  if (match.prediction) return { label: "Pronosticado", tone: "done" as const };
  return { label: "Disponible", tone: "open" as const };
}

export function MiQuinielaPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [tab, setTab] = useState<Tab>("semana");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listMatches()
      .then((rows) => {
        if (alive) setMatches(rows.filter((m) => !m.demo && !m.simulation));
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la quiniela.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    if (tab === "semana") {
      const weekLater = new Date();
      weekLater.setDate(now.getDate() + 7);
      return matches.filter((m) => {
        const d = new Date(m.startsAt);
        return d >= now && d <= weekLater;
      });
    }
    if (tab === "proximos") {
      return matches.filter((m) => matchPhase(m) !== "finished" && matchPhase(m) !== "cancelled");
    }
    return matches.filter((m) => matchPhase(m) === "finished" || matchPhase(m) === "cancelled");
  }, [matches, tab]);

  const grouped = useMemo(() => {
    const map = new Map<string, BaseballMatch[]>();
    for (const match of filtered) {
      const key = whenDate(match.startsAt) || "Sin fecha";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(match);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/tobo")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Mi Quiniela</h2>
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="grid grid-cols-3 gap-1">
          {(["semana", "proximos", "finalizados"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-11 rounded-2xl text-[12px] font-extrabold ${
                tab === t ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"
              }`}
            >
              {t === "semana" ? "Esta semana" : t === "proximos" ? "Proximos" : "Finalizados"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        {grouped.length === 0 && !error && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">No hay partidos en esta seccion</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Cambia de pestana o vuelve mas tarde.</p>
          </div>
        )}

        {grouped.map(([date, dayMatches]) => (
          <div key={date} className="mb-4">
            <p className="mb-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">{date}</p>
            <div className="flex flex-col gap-2">
              {dayMatches.map((match) => {
                const info = statusInfo(match);
                const toneClass =
                  info.tone === "live"
                    ? "bg-[#E8360C] text-white"
                    : info.tone === "done"
                      ? "bg-[#FFF1EA] text-[#FF4F1A]"
                      : info.tone === "locked"
                        ? "bg-[#F3E4D8] text-[#8D7366]"
                        : "bg-[#FFF1EA] text-[#FF4F1A]";
                return (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => navigate(`/tobo/partidos/${match.id}`)}
                    className="rounded-[24px] bg-white px-4 py-4 text-left shadow-[0_8px_20px_rgba(80,40,10,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-extrabold">{match.awayTeam}</p>
                        <p className="text-[12px] font-bold text-[#A08B80]">visitante</p>
                        <p className="mt-1 text-[15px] font-extrabold">{match.homeTeam}</p>
                        <p className="text-[12px] font-bold text-[#A08B80]">local</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold ${toneClass}`}>{info.label}</span>
                    </div>
                    <p className="mt-2 text-[13px] font-semibold text-[#8D7366]">{whenTime(match.startsAt)}</p>

                    {match.prediction && (
                      <p className="mt-2 text-[14px] font-extrabold">
                        Tu pronostico: {scoreLine(match, match.prediction.homeScore, match.prediction.awayScore)}
                      </p>
                    )}

                    {matchPhase(match) === "finished" && match.homeScore !== null && match.awayScore !== null && (
                      <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
                        Resultado oficial: {scoreLine(match, match.homeScore, match.awayScore)}
                        {match.prediction?.processed && match.prediction.total !== null ? (
                          <span className="ml-2 font-extrabold text-[#FF4F1A]">+{match.prediction.total} PT</span>
                        ) : null}
                      </p>
                    )}

                    {matchPhase(match) === "open" && !match.prediction && (
                      <p className="mt-2 text-[13px] font-extrabold text-[#FF4F1A]">Haz tu pronostico</p>
                    )}
                    {matchPhase(match) === "open" && match.prediction && (
                      <p className="mt-2 text-[13px] font-extrabold text-[#FF4F1A]">Editar pronostico</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <TabBar />
    </div>
  );
}
