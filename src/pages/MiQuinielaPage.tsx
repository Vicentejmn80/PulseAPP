import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StandingsTable } from "@/components/lvbp/StandingsTable";
import { BackButton } from "@/components/ui/Buttons";
import { TabBar } from "@/components/ui/TabBar";
import { LVBP_EXPERIENCE_TITLE } from "@/config/lvbpBrand";
import { lvbpStandings } from "@/lib/lvbpStandings";
import { listMatches, matchPhase, scoreLine, type BaseballMatch } from "@/services/matchesApi";
import { isFinalizedPrediction, isSuspendedMatch, isUpcomingPrediction, predictionBadge } from "@/lib/predictions/state";

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

type View = "pronostico" | "tabla";

export function MiQuinielaPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("vista") === "tabla" ? "tabla" : "pronostico";
  const [matches, setMatches] = useState<BaseballMatch[]>([]);
  const [tab, setTab] = useState<Tab>("proximos");
  const [tabTouched, setTabTouched] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    listMatches()
      .then((rows) => {
        setMatches(rows.filter((m) => !m.demo && !m.simulation));
        setError("");
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "No se pudieron cargar los pronósticos.");
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (view !== "tabla") return;
    const timer = window.setInterval(load, 45_000);
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [view, load]);

  function setView(next: View) {
    if (next === "tabla") setParams({ vista: "tabla" }, { replace: true });
    else setParams({}, { replace: true });
  }

  const upcomingCount = useMemo(() => matches.filter(isUpcomingPrediction).length, [matches]);
  const finalizedCount = useMemo(() => matches.filter(isFinalizedPrediction).length, [matches]);

  // Si no hay próximos pero sí historial, abrir directamente en Finalizados
  // para no obligar al usuario a descubrir el tab. Solo una vez y solo si
  // el usuario no eligió tab manualmente.
  useEffect(() => {
    if (!loaded || tabTouched) return;
    if (upcomingCount === 0 && finalizedCount > 0) setTab("finalizados");
  }, [loaded, tabTouched, upcomingCount, finalizedCount]);

  const hasWeek = useMemo(() => {
    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(now.getDate() + 7);
    return matches.some((m) => {
      if (isSuspendedMatch(m)) return false;
      const d = new Date(m.startsAt);
      return d >= now && d <= weekLater;
    });
  }, [matches]);

  const tabs = useMemo(() => {
    const base: Tab[] = ["proximos", "finalizados"];
    return hasWeek ? (["semana", ...base] as Tab[]) : base;
  }, [hasWeek]);

  const filtered = useMemo(() => {
    const now = new Date();
    if (tab === "semana") {
      const weekLater = new Date();
      weekLater.setDate(now.getDate() + 7);
      return matches.filter((m) => {
        if (isSuspendedMatch(m)) return false;
        const d = new Date(m.startsAt);
        return d >= now && d <= weekLater;
      });
    }
    if (tab === "proximos") {
      return matches.filter(isUpcomingPrediction);
    }
    return matches.filter(isFinalizedPrediction);
  }, [matches, tab]);

  const standings = useMemo(() => (loaded ? lvbpStandings(matches) : null), [loaded, matches]);

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
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>{LVBP_EXPERIENCE_TITLE}</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Pronósticos</h2>
        </div>
      </div>

      <div className="px-4 pb-2 sm:px-6 lg:px-8">
        <div className="mb-2 grid grid-cols-2 gap-2" role="tablist" aria-label="Pronósticos o tabla">
          {([
            ["pronostico", "Pronóstico"],
            ["tabla", "Tabla de posiciones"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`min-h-[44px] rounded-2xl px-2 text-[13px] font-extrabold leading-tight active:scale-[0.98] ${
                view === id ? "bg-[#C6FF3D] text-[#0B0D0F]" : "bg-white/10 text-[#F4F6FA]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "pronostico" ? (
        <div className={`grid gap-1 ${tabs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTabTouched(true);
                setTab(t);
              }}
              className={`h-11 rounded-2xl text-[12px] font-extrabold ${
                tab === t ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"
              }`}
            >
              {t === "semana"
                ? "Esta semana"
                : t === "proximos"
                  ? `Próximos (${upcomingCount})`
                  : `Finalizados (${finalizedCount})`}
            </button>
          ))}
        </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 lg:px-8">
        {view === "tabla" ? (
          <div key="tabla" className="adm-enter">
            {error ? (
              <div className="mb-3">
                <p className="rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>
                <button type="button" onClick={load} className="mt-3 min-h-[44px] rounded-2xl bg-[#0B0D0F] px-4 text-[13px] font-extrabold text-[#C6FF3D]">Reintentar</button>
              </div>
            ) : null}
            {!standings ? <div className="adm-shimmer h-80 rounded-[18px]" aria-busy="true" aria-label="Cargando tabla" /> : <StandingsTable rows={standings.rows} />}
          </div>
        ) : (
        <div key="pronostico" className="adm-enter">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        {grouped.length === 0 && !error && (
          <div className="rounded-[28px] bg-white px-6 py-8 text-center">
            <p className="text-[16px] font-extrabold">
              {tab === "proximos"
                ? "📅 No hay pronósticos próximos"
                : tab === "finalizados"
                  ? "Aún no hay juegos finalizados"
                  : "Esta semana no hay juegos"}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Vuelve más tarde o revisa otra sección.</p>
          </div>
        )}

        {grouped.map(([date, dayMatches]) => (
          <div key={date} className="mb-4">
            <p className="mb-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">{date}</p>
            <div className="flex flex-col gap-2">
              {dayMatches.map((match) => {
                const info = predictionBadge(match);
                const toneClass =
                  info.tone === "open"
                    ? "bg-[#E8FFF6] text-[#0E8A63]"
                    : info.tone === "locked"
                      ? "bg-[#F3E4D8] text-[#8D7366]"
                      : "bg-[#F3E4D8] text-[#8D7366]";
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
                        ) : match.prediction ? (
                          <span className="ml-2 font-extrabold">⏳ pendiente de liquidación</span>
                        ) : null}
                      </p>
                    )}

                    {matchPhase(match) === "open" && !isSuspendedMatch(match) && (
                      <p className="mt-2 text-[13px] font-extrabold text-[#FF4F1A]">
                        {match.prediction ? "Editar pronóstico ✍️" : "Haz tu pronóstico 🎯"}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        </div>
        )}
      </div>
      <TabBar />
    </div>
  );
}
