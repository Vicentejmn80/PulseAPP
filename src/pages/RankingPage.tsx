import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Users } from "lucide-react";
import { CardHead, GhostCta, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { pointsToPass, RANKING_TOP, shortAlias, showZoneEllipsis, ZONA_VECINOS } from "@/lib/rankingView";
import { caracasDateKey, cycleContainingToday, pickActiveCycle } from "@/lib/toboHome";
import { listMyLeagues, type League } from "@/services/leaguesApi";
import { listCycles, loadCycleWindow, type ToboCycle } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";

type Tab = "global" | "liga" | "semana" | "temporada";

export function RankingPage() {
  const navigate = useNavigate();
  const { reload } = usePulse();
  const [tab, setTab] = useState<Tab>("global");
  const [top, setTop] = useState<LeaderboardEntry[]>([]);
  const [zone, setZone] = useState<LeaderboardEntry[]>([]);
  const [above, setAbove] = useState<LeaderboardEntry | null>(null);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [currentCycleId, setCurrentCycleId] = useState("");
  const [myPoints, setMyPoints] = useState(0);
  const [mine, setMine] = useState<LeaderboardEntry | null>(null);
  const [hasPrivateLeague, setHasPrivateLeague] = useState(false);
  const [error, setError] = useState("");
  const openedLeague = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listCycles(), listMyLeagues()])
      .then(([, cycleRows, leagueRows]) => {
        if (!alive) return;
        const today = caracasDateKey(new Date());
        setCycles(cycleRows);
        setCurrentCycleId(cycleContainingToday(cycleRows, today)?.id ?? "");
        setLeagues(leagueRows);
        setHasPrivateLeague(leagueRows.length > 0);
        if (leagueRows.length > 0 && !selectedLeague) {
          setSelectedLeague(leagueRows[0].id);
        }
        if (leagueRows.length > 0 && !openedLeague.current) {
          openedLeague.current = true;
          setTab("liga");
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
    const cycle = tab === "temporada" || !currentCycleId ? "lifetime" : currentCycleId;

    if (!cycle) {
      setTop([]);
      setZone([]);
      setAbove(null);
      setMine(null);
      return;
    }

    const leagueId = tab === "liga" ? selectedLeague || undefined : undefined;
    if (tab === "liga" && !selectedLeague) {
      setTop([]);
      setZone([]);
      setAbove(null);
      setMine(null);
      return;
    }

    loadCycleWindow(cycle, leagueId, RANKING_TOP, ZONA_VECINOS)
      .then((board) => {
        if (!alive) return;
        setTop(board.top);
        setZone(board.zone);
        setAbove(board.above);
        setMine(board.mine);
        setMyPoints(board.points);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar el ranking.");
      });
    return () => {
      alive = false;
    };
  }, [tab, selectedLeague, currentCycleId]);

  const upcoming = !currentCycleId ? pickActiveCycle(cycles) : null;
  const round = tab === "semana" ? cycles.find((item) => item.id === currentCycleId) : null;
  const gap = mine && mine.position > 1 && above ? pointsToPass(mine.points, above.points) : null;
  const ellipsis = zone.length > 0 && showZoneEllipsis(zone[0].position, RANKING_TOP);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>Juégate el Tobo</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Ranking</h2>
        <p className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>
          🥇🥈🥉 Los primeros 3 lugares ganan un premio cada semana.
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
                {t === "global" ? "Global" : t === "liga" ? "Mi Liga" : t === "semana" ? "Ronda" : "Histórico"}
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
            <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>
              Tu posición
            </p>
            <p className="mt-3 text-[64px] font-extrabold leading-none tabular-nums" style={{ color: "var(--t-accent)" }}>
              {mine ? `#${mine.position}` : "—"}
            </p>
            <p className="mt-5 text-[40px] font-extrabold leading-none tabular-nums">{formato(myPoints)}</p>
            <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
              {tab === "temporada" || !currentCycleId ? "PT históricos de Juégate el Tobo" : "PT de la ronda actual"}
            </p>
            <p className="mt-4 text-[15px] font-extrabold">
              {!mine
                ? hasPrivateLeague && tab !== "liga"
                  ? "Participas en una liga privada y no apareces en el ranking abierto."
                  : "Pronostica y entras a la carrera."
                : mine.position <= 1
                  ? "Vas en primer lugar"
                  : gap != null && above
                    ? `Te faltan ${formato(gap)} pts para pasar al #${above.position}`
                    : "El ranking se arma con los primeros puntos de la ronda."}
            </p>
            {!currentCycleId && tab !== "temporada" && (
              <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                La próxima ronda todavía no empieza{upcoming ? ` (${upcoming.startsOn})` : ""}. Estos son tus puntos acumulados.
              </p>
            )}
            {round && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                <CalendarDays className="h-3.5 w-3.5" />
                {round.startsOn} al {round.endsOn}
              </p>
            )}
          </ToboCard>

          <ToboCard>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Top 10</p>
            <div className="mt-3 flex flex-col gap-2">
              {top.length === 0 && (
                <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Todavía no hay jugadores en este ranking.</p>
              )}
              {top.map((entry) => (
                <RankRow key={entry.user.id} entry={entry} />
              ))}
            </div>
          </ToboCard>

          {ellipsis && (
            <p className="text-center text-[18px] font-extrabold tracking-[0.4em]" style={{ color: "var(--t-muted)" }}>...</p>
          )}

          {zone.length > 0 && (
            <ToboCard>
              <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Tu zona</p>
              <div className="mt-3 flex flex-col gap-2">
                {zone.map((entry) => (
                  <RankRow key={entry.user.id} entry={entry} />
                ))}
              </div>
            </ToboCard>
          )}

          <p className="px-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
            Ante empate en puntos, queda primero quien llegó antes a esa puntuación.
          </p>
        </div>
      </div>
      <TabBar />
    </div>
  );
}

function RankRow({ entry }: { entry: LeaderboardEntry }) {
  const podium = entry.position <= 3;
  const mine = entry.isCurrentUser;
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-3 py-3"
      style={
        mine
          ? { backgroundColor: "var(--t-tint)", border: "1px solid var(--t-accent)" }
          : podium
            ? { backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid var(--t-accent)" }
            : { backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--t-border)" }
      }
    >
      <p className="w-10 text-[16px] font-extrabold tabular-nums" style={{ color: podium || mine ? "var(--t-accent)" : "var(--t-text)" }}>
        #{entry.position}
      </p>
      <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold">{shortAlias(entry.user.alias)}</p>
      <p className="text-[14px] font-extrabold tabular-nums">{formato(entry.points)}</p>
    </div>
  );
}
