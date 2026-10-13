import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Users } from "lucide-react";
import { LeagueInviteSheet, LeagueShareBar } from "@/components/tobo/LeagueInvite";
import { CardHead, GhostCta, GoldCta, ToboCard } from "@/components/tobo/surface";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { pointsToPass, RANKING_TOP, shortAlias, showZoneEllipsis, ZONA_VECINOS } from "@/lib/rankingView";
import { LVBP_EXPERIENCE_TITLE } from "@/config/lvbpBrand";
import { caracasDateKey, cycleClosesLabel, cycleContainingToday, cyclePeriodLabel, pickActiveCycle } from "@/lib/toboHome";
import { listMyLeagues, type League } from "@/services/leaguesApi";
import { listCycles, loadCycleBoard, loadCycleWindow, type ToboCycle } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";

type Tab = "global" | "liga" | "semana" | "temporada";

function friendlyError(reason: unknown, fallback: string) {
  const message = reason instanceof Error ? reason.message : "";
  if (message && !/[A-Z_]{4,}|SQL|column/i.test(message)) return message;
  console.error("ranking", reason);
  return fallback;
}

function roundCountdown(endsOn: string) {
  const close = new Date(`${endsOn}T23:59:59-04:00`);
  const ms = close.getTime() - Date.now();
  if (Number.isNaN(close.getTime()) || ms <= 0) return "La ronda ya cerró";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `Cierra en ${days}d ${hours}h`;
  return `Cierra en ${hours}h`;
}

export function RankingPage() {
  const navigate = useNavigate();
  const { reload, currentUser } = usePulse();
  const [tab, setTab] = useState<Tab>("global");
  const [top, setTop] = useState<LeaderboardEntry[]>([]);
  const [zone, setZone] = useState<LeaderboardEntry[]>([]);
  const [members, setMembers] = useState<LeaderboardEntry[]>([]);
  const [above, setAbove] = useState<LeaderboardEntry | null>(null);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState("");
  const [currentCycleId, setCurrentCycleId] = useState("");
  const [myPoints, setMyPoints] = useState(0);
  const [lifetimePoints, setLifetimePoints] = useState(0);
  const [total, setTotal] = useState(0);
  const [mine, setMine] = useState<LeaderboardEntry | null>(null);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [closedPodiums, setClosedPodiums] = useState<{ cycle: ToboCycle; top: LeaderboardEntry[] }[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listCycles(), listMyLeagues()])
      .then(([, cycleRows, leagueRows]) => {
        if (!alive) return;
        const today = caracasDateKey(new Date());
        setCycles(cycleRows);
        setCurrentCycleId(cycleContainingToday(cycleRows, today)?.id ?? "");
        setLeagues(leagueRows);
        setSelectedLeague((current) => current || leagueRows[0]?.id || "");
      })
      .catch((reason: unknown) => {
        if (alive) setError(friendlyError(reason, "No se pudo cargar el ranking."));
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  useEffect(() => {
    let alive = true;
    const cycle = currentCycleId || "lifetime";

    if (tab === "liga") {
      if (!selectedLeague) {
        setMembers([]);
        setMine(null);
        setTop([]);
        setZone([]);
        return undefined;
      }
      Promise.all([loadCycleBoard(cycle, selectedLeague), loadCycleBoard("lifetime", selectedLeague)])
        .then(([round, life]) => {
          if (!alive) return;
          setMembers(round.entries);
          setMine(round.mine);
          setMyPoints(round.points);
          setLifetimePoints(life.points);
          setTotal(round.entries.length);
          const rank = round.mine?.position ?? 0;
          setAbove(rank > 1 ? round.entries.find((row) => row.position === rank - 1) ?? null : null);
          setTop([]);
          setZone([]);
        })
        .catch((reason: unknown) => {
          if (alive) setError(friendlyError(reason, "No se pudo cargar el ranking de la liga."));
        });
      return () => {
        alive = false;
      };
    }

    if (tab === "temporada") {
      const closed = cycles.filter((row) => row.status === "closed" || (row.endsOn && row.endsOn < caracasDateKey(new Date()) && row.id !== "demo_cierre"));
      Promise.all([
        loadCycleWindow("lifetime", undefined, RANKING_TOP, ZONA_VECINOS),
        ...closed.slice(0, 8).map((row) => loadCycleWindow(row.id, undefined, 3, 0).then((board) => ({ cycle: row, top: board.top.slice(0, 3) }))),
      ])
        .then(([board, ...podiums]) => {
          if (!alive) return;
          setMyPoints(board.points);
          setMine(board.mine);
          setTotal(board.total);
          setTop([]);
          setZone([]);
          setAbove(null);
          setClosedPodiums(podiums as { cycle: ToboCycle; top: LeaderboardEntry[] }[]);
        })
        .catch((reason: unknown) => {
          if (alive) setError(friendlyError(reason, "No se pudo cargar el histórico."));
        });
      return () => {
        alive = false;
      };
    }

    const windowCycle = tab === "semana" || tab === "global" ? (currentCycleId || "lifetime") : "lifetime";
    loadCycleWindow(windowCycle, undefined, RANKING_TOP, ZONA_VECINOS)
      .then((board) => {
        if (!alive) return;
        setTop(board.top);
        setZone(board.mine && board.mine.position > RANKING_TOP ? board.zone : []);
        setAbove(board.above);
        setMine(board.mine);
        setMyPoints(board.points);
        setTotal(board.total);
        setMembers([]);
      })
      .catch((reason: unknown) => {
        if (alive) setError(friendlyError(reason, "No se pudo cargar el ranking."));
      });
    return () => {
      alive = false;
    };
  }, [tab, selectedLeague, currentCycleId, leagues, cycles]);

  const league = leagues.find((row) => row.id === selectedLeague) ?? null;
  const upcoming = !currentCycleId ? pickActiveCycle(cycles) : null;
  const round = cycles.find((item) => item.id === currentCycleId) ?? null;
  const gap = mine && mine.position > 1 && above ? pointsToPass(mine.points, above.points) : null;
  const ellipsis = zone.length > 0 && showZoneEllipsis(zone[0].position, RANKING_TOP);
  const title =
    tab === "global"
      ? "Ranking global"
      : tab === "liga"
        ? `Ranking de ${league?.name || "tu liga"}`
        : tab === "semana"
          ? round
            ? cyclePeriodLabel(round)
            : "Ronda"
          : "Histórico de la temporada";
  const subtitle =
    tab === "global"
      ? "Todos los jugadores · Puntos de la ronda actual"
      : tab === "liga"
        ? "Solo los miembros de tu liga"
        : tab === "semana"
          ? `${round ? `${cycleClosesLabel(round.endsOn)} · ${roundCountdown(round.endsOn)}` : "Puntos solo de esta ronda"} · Premio de la ronda para el top 3`
          : "Puntos acumulados de la temporada";

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--t-accent)" }}>{LVBP_EXPERIENCE_TITLE}</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">{title}</h2>
        <p className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>{subtitle}</p>
        {tab !== "liga" && (
          <p className="mt-1 text-[13px] font-extrabold" style={{ color: "var(--t-muted)" }}>
            🥇🥈🥉 Los primeros 3 lugares ganan un premio cada ronda.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-1.5">
            {(["global", "liga", "semana", "temporada"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className="min-h-11 rounded-[14px] px-1 py-2 text-[11px] font-extrabold leading-tight"
                style={
                  tab === item
                    ? { backgroundColor: "var(--t-accent)", color: "var(--t-accent-text)" }
                    : { backgroundColor: "var(--t-card)", color: "var(--t-muted)", border: "1px solid var(--t-border)" }
                }
              >
                {item === "global" ? "Global" : item === "liga" ? "Mi Liga" : item === "semana" ? "Ronda" : "Históricos"}
              </button>
            ))}
          </div>

          {tab === "liga" && leagues.length > 1 && (
            <select
              value={selectedLeague}
              onChange={(event) => setSelectedLeague(event.target.value)}
              className="h-12 w-full rounded-[14px] px-3 text-[13px] font-extrabold outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--t-text)", border: "1px solid var(--t-border)" }}
            >
              {leagues.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          )}

          {error && <p className="rounded-2xl px-4 py-3 text-[13px] font-bold text-[#E23B2F]" style={{ backgroundColor: "var(--t-card)" }}>{error}</p>}

          {tab === "liga" && leagues.length === 0 && (
            <ToboCard>
              <CardHead icon={Users} title="Aún no tienes liga" />
              <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Crea una o únete con un código de invitación.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <GoldCta onClick={() => navigate("/tobo/ligas?tab=crear")}>Crear liga</GoldCta>
                <GhostCta onClick={() => navigate("/tobo/ligas?tab=unirme")}>Unirme con código</GhostCta>
              </div>
            </ToboCard>
          )}

          {tab === "liga" && league && (
            <>
              <PositionCard
                label="Tu posición en la liga"
                mine={mine}
                points={myPoints}
                total={total}
                gap={gap}
                above={above}
                extra={`${formato(lifetimePoints)} pts acumulados`}
              />
              <ToboCard>
                <LeagueShareBar
                  league={league}
                  alias={currentUser?.alias || "Un rusher"}
                  onInvite={() => setInviteOpen(true)}
                />
                {league.isOwner && (
                  <div className="mt-2">
                    <GhostCta onClick={() => navigate(`/tobo/ligas/${league.id}`)}>Gestionar</GhostCta>
                  </div>
                )}
              </ToboCard>
              <ToboCard>
                <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Miembros</p>
                <div className="mt-3 flex flex-col gap-2">
                  {members.length === 0 && <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Todavía no hay puntos en la liga.</p>}
                  {members.map((entry) => (
                    <RankRow key={entry.user.id} entry={entry} highlightPodium={false} />
                  ))}
                </div>
              </ToboCard>
              {inviteOpen && <LeagueInviteSheet leagueId={league.id} onClose={() => setInviteOpen(false)} />}
            </>
          )}

          {(tab === "global" || tab === "semana") && (
            <>
              <PositionCard
                label={tab === "global" ? "Tu posición global" : "Tu posición en la ronda"}
                mine={mine}
                points={myPoints}
                total={total}
                gap={gap}
                above={above}
                extra={!currentCycleId ? `La próxima ronda todavía no empieza${upcoming ? ` (${cyclePeriodLabel(upcoming)})` : ""}.` : undefined}
              />
              {round && tab === "semana" && (
                <p className="flex items-center gap-1.5 px-1 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  {cyclePeriodLabel(round)}
                </p>
              )}
              <ToboCard>
                <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Top 10</p>
                <div className="mt-3 flex flex-col gap-2">
                  {top.length === 0 && <p className="text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Todavía no hay jugadores en este ranking.</p>}
                  {top.map((entry) => (
                    <RankRow key={entry.user.id} entry={entry} highlightPodium />
                  ))}
                </div>
              </ToboCard>
              {ellipsis && <p className="text-center text-[18px] font-extrabold tracking-[0.4em]" style={{ color: "var(--t-muted)" }}>...</p>}
              {zone.length > 0 && (
                <ToboCard>
                  <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Tu zona</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {zone.map((entry) => (
                      <RankRow key={entry.user.id} entry={entry} highlightPodium={false} />
                    ))}
                  </div>
                </ToboCard>
              )}
            </>
          )}

          {tab === "temporada" && (
            <>
              <ToboCard>
                <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>Puntos de la temporada</p>
                <p className="mt-3 text-[40px] font-extrabold leading-none tabular-nums">{formato(myPoints)}</p>
                <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>Acumulados de todas las rondas</p>
              </ToboCard>
              {closedPodiums.length === 0 ? (
                <ToboCard>
                  <p className="text-[15px] font-extrabold">Aún no hay rondas finalizadas</p>
                </ToboCard>
              ) : (
                closedPodiums.map((row) => (
                  <ToboCard key={row.cycle.id}>
                    <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>{cyclePeriodLabel(row.cycle)}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {row.top.map((entry) => (
                        <RankRow key={entry.user.id} entry={entry} highlightPodium />
                      ))}
                    </div>
                  </ToboCard>
                ))
              )}
            </>
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

function PositionCard({
  label,
  mine,
  points,
  total,
  gap,
  above,
  extra,
}: {
  label: string;
  mine: LeaderboardEntry | null;
  points: number;
  total: number;
  gap: number | null;
  above: LeaderboardEntry | null;
  extra?: string;
}) {
  return (
    <ToboCard>
      <p className="text-[12px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>{label}</p>
      <p className="mt-3 text-[64px] font-extrabold leading-none tabular-nums" style={{ color: "var(--t-accent)" }}>
        {mine ? `#${mine.position}` : "—"}
      </p>
      {mine && <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>#{mine.position} de {total || "—"}</p>}
      <p className="mt-5 text-[40px] font-extrabold leading-none tabular-nums">{formato(points)}</p>
      <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>puntos</p>
      <p className="mt-4 text-[15px] font-extrabold">
        {!mine
          ? "Pronostica y entras a la carrera."
          : mine.position <= 1
            ? "Vas en primer lugar"
            : gap != null && above
              ? `Te faltan ${formato(gap)} pts para pasar al #${above.position}`
              : "El ranking se arma con los primeros puntos de la ronda."}
      </p>
      {extra && <p className="mt-2 text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{extra}</p>}
    </ToboCard>
  );
}

function RankRow({ entry, highlightPodium }: { entry: LeaderboardEntry; highlightPodium: boolean }) {
  const podium = highlightPodium && entry.position <= 3;
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
