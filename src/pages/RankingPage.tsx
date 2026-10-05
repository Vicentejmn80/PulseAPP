import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { RankingList } from "@/components/ranking/RankingList";
import { CardHead, GhostCta, StatCell, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { getLeagueRanking, listMyLeagues, type League } from "@/services/leaguesApi";
import { listCycles, listRanking, type ToboCycle } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";
import { TOBO_ROUND_PRIZE_SUBTITLE } from "@/config/tobo";

type Tab = "global" | "liga" | "semana" | "temporada";

const cycleForTab: Record<string, string> = {
  semana: "ronda_1",
  temporada: "lifetime",
};

export function RankingPage() {
  const navigate = useNavigate();
  const { reload } = usePulse();
  const [tab, setTab] = useState<Tab>("global");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listCycles(), listMyLeagues()])
      .then(([, cycleRows, leagueRows]) => {
        if (!alive) return;
        setCycles(cycleRows);
        setLeagues(leagueRows);
        if (leagueRows.length > 0 && !selectedLeague) {
          setSelectedLeague(leagueRows[0].id);
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar el ranking.");
      });
    return () => {
      alive = false;
    };
  }, [reload, selectedLeague]);

  useEffect(() => {
    let alive = true;
    const cycle = cycleForTab[tab] ?? "lifetime";

    if (tab === "liga") {
      if (!selectedLeague) {
        setEntries([]);
        return;
      }
      getLeagueRanking(selectedLeague, "lifetime")
        .then((rows) => {
          if (alive) setEntries(rows);
        })
        .catch((reason: unknown) => {
          if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar la liga.");
        });
      return () => {
        alive = false;
      };
    }

    listRanking(cycle)
      .then((rows) => {
        if (alive) setEntries(rows);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar el ranking.");
      });
    return () => {
      alive = false;
    };
  }, [tab, selectedLeague]);

  const me = entries.find((entry) => entry.isCurrentUser);
  const round = tab === "semana" ? cycles.find((item) => item.id === "ronda_1") : null;
  const top10 = tab === "liga" ? entries : entries.slice(0, 10);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>Juégate el Tobo</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Ranking</h2>
        <p className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>
          🏆 {TOBO_ROUND_PRIZE_SUBTITLE}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-1.5">
            {(["global", "liga", "semana", "temporada"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="min-h-11 rounded-[14px] px-1 py-2 text-[11px] font-extrabold leading-tight"
                style={
                  tab === t
                    ? { backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }
                    : { backgroundColor: "var(--t-card)", color: "var(--t-muted)", border: "1px solid var(--t-border)" }
                }
              >
                {t === "global" ? "Global" : t === "liga" ? "Mi Liga" : t === "semana" ? "Semana" : "Temporada"}
              </button>
            ))}
          </div>

          {tab === "liga" && (
            <ToboCard>
              <CardHead icon={Users} title="Tu liga" />
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="h-12 w-full rounded-[14px] px-3 text-[13px] font-extrabold outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--t-text)", border: "1px solid var(--t-border)" }}
              >
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}
                  </option>
                ))}
                {leagues.length === 0 && <option value="">No tienes ligas</option>}
              </select>
              <div className="mt-3">
                <GhostCta onClick={() => navigate("/tobo/ligas")}>Gestionar</GhostCta>
              </div>
            </ToboCard>
          )}

          {error && <p className="rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>{error}</p>}

          <ToboCard>
            <CardHead icon={Trophy} title={tab === "liga" ? "Ranking de tu liga" : "Top 10 global"} />
            <p className="mb-3 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              {tab === "liga" ? "Tu liga privada" : tab === "temporada" ? "Puntos acumulados" : "Puntos de la ronda"}
            </p>
            <RankingList
              entries={top10}
              subtitle={tab === "liga" ? "Tu liga privada" : tab === "temporada" ? "Puntos acumulados" : "Puntos de la ronda"}
              emptyLabel={tab === "liga" && leagues.length === 0 ? "Crea o únete a una liga" : "Todavía no hay jugadores"}
            />
          </ToboCard>

          <ToboCard>
            <CardHead icon={Trophy} title="Tu posición" />
            <div className="grid grid-cols-2 gap-2">
              <StatCell value={me ? `#${me.position}` : "—"} label="posición" />
              <StatCell value={formato(me?.points ?? 0)} label="puntos" />
            </div>
            <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>
              {me ? `Tu puesto exacto: #${me.position}. ¡Sigue sumando! 🚀` : "Compite y aparece en el ranking. 🎯"}
            </p>
            {round && (
              <p className="mt-1 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                <CalendarDays className="h-3.5 w-3.5" />
                {round.startsOn} al {round.endsOn}
              </p>
            )}
          </ToboCard>
        </div>
      </div>
      <TabBar />
    </div>
  );
}
