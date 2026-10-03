import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RankingList } from "@/components/ranking/RankingList";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { getLeagueRanking, listMyLeagues, type League } from "@/services/leaguesApi";
import { listCycles, listRanking, type ToboCycle } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";

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

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Ranking</h2>
        <p className="text-[13px] font-semibold text-[#8D7366]">
          {me ? `Vas #${me.position} con ${formato(me.points)} pts.` : "Compite con tus amigos y sube de posicion."}
        </p>
        {round && <p className="text-[12px] font-bold text-[#A08B80]">{round.startsOn} al {round.endsOn}</p>}

        <div className="mt-3 grid grid-cols-4 gap-1">
          {(["global", "liga", "semana", "temporada"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-11 rounded-2xl text-[12px] font-extrabold ${tab === t ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
            >
              {t === "global" ? "Global" : t === "liga" ? "Mi Liga" : t === "semana" ? "Semana" : "Temporada"}
            </button>
          ))}
        </div>

        {tab === "liga" && (
          <div className="mt-2 flex items-center gap-2">
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="h-11 flex-1 rounded-2xl bg-white px-3 text-[13px] font-extrabold text-[#241710] outline-none"
            >
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
              {leagues.length === 0 && <option value="">No tienes ligas</option>}
            </select>
            <button
              type="button"
              onClick={() => navigate("/tobo/ligas")}
              className="h-11 rounded-2xl bg-[#FFF1EA] px-3 text-[12px] font-extrabold text-[#FF4F1A]"
            >
              Gestionar
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        <RankingList
          entries={entries}
          subtitle={tab === "liga" ? "Tu liga privada" : tab === "temporada" ? "Puntos acumulados" : "Puntos de la ronda"}
          emptyLabel={tab === "liga" && leagues.length === 0 ? "Crea o unete a una liga" : "Todavia no hay jugadores"}
        />
      </div>
      <TabBar />
    </div>
  );
}
