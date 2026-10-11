import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { TabBar } from "@/components/ui/TabBar";
import { CardHead, StatLine, ToboCard } from "@/components/tobo/surface";
import { replayLvbpOnboarding } from "@/components/tobo/ToboOnboarding";
import { LVBP_EXPERIENCE_TITLE } from "@/config/lvbpBrand";
import { formato, gameTypeLabel } from "@/lib/format";
import { caracasDateKey, cycleContainingToday } from "@/lib/toboHome";
import { myStats, type UserStats } from "@/services/analytics";
import { adminVenueList } from "@/services/demoApi";
import { listMyLeagues, type League } from "@/services/leaguesApi";
import { listCycles, loadCycleBoard } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { PointsTransaction } from "@/types/pulse";

function movementLabel(tx: PointsTransaction) {
  if (tx.sourceType === "prediction" && tx.metadata) {
    return `Pronostico · +${tx.metadata.winnerPoints ?? 0} ganador · +${tx.metadata.closenessPoints ?? 0} cercania`;
  }
  return gameTypeLabel(tx.sourceType);
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { currentUser, transactions, logout, reload } = usePulse();
  const [position, setPosition] = useState<number | null>(null);
  const [roundPoints, setRoundPoints] = useState(0);
  const [seasonPoints, setSeasonPoints] = useState(0);
  const [roundName, setRoundName] = useState("Ronda actual");
  const [showingRound, setShowingRound] = useState(false);
  const [rankingLabel, setRankingLabel] = useState("ranking abierto");
  const [isAdmin, setIsAdmin] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listCycles(), listMyLeagues(), myStats()])
      .then(async ([, cycleRows, leagueRows, userStats]) => {
        if (!alive) return;
        const leagueId = leagueRows[0]?.id;
        const seasonBoard = await loadCycleBoard("lifetime", leagueId);
        const today = caracasDateKey(new Date());
        const live = cycleContainingToday(cycleRows, today);
        const standingBoard = live ? await loadCycleBoard(live.id, leagueId) : seasonBoard;
        if (!alive) return;
        setPosition(standingBoard.mine?.position ?? null);
        setRoundPoints(live ? standingBoard.points : seasonBoard.points);
        setSeasonPoints(seasonBoard.points);
        setRoundName(live?.name ?? "Puntos acumulados");
        setShowingRound(Boolean(live));
        setRankingLabel(
          leagueRows.length > 0
            ? `ranking de ${leagueRows[0].name}`
            : live
              ? "ranking abierto"
              : "ranking histórico",
        );
        setLeagues(leagueRows);
        setStats(userStats);
      })
      .catch(() => {
        if (alive) setPosition(null);
      });
    const adminCode = currentUser.accessCode ?? "";
    if (adminCode) {
      adminVenueList(adminCode)
        .then(() => {
          if (alive) setIsAdmin(true);
        })
        .catch(() => {
          if (alive) setIsAdmin(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [reload, currentUser.accessCode]);

  const recent = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--t-bg)", color: "var(--t-text)" }}>
      <div className="shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>
          {LVBP_EXPERIENCE_TITLE}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full text-[24px] font-extrabold"
            style={{ background: currentUser.avatarColor, border: "2px solid var(--t-border)" }}
          >
            {currentUser.initials}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-extrabold leading-tight">{currentUser.alias}</h2>
            <p className="text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>{currentUser.handle}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <ToboCard className="text-center">
          <p className="text-[40px] font-extrabold leading-none tabular-nums">{formato(seasonPoints)}</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--t-muted)" }}>
            puntos históricos en {LVBP_EXPERIENCE_TITLE}
          </p>
        </ToboCard>

        <div className="mt-3">
          <ToboCard>
            <CardHead icon={BarChart3} title={`Resumen · ${roundName}`} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <p className="text-[28px] font-extrabold tabular-nums leading-none">#{position ?? "—"}</p>
                <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{rankingLabel}</p>
              </div>
              <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <p className="text-[28px] font-extrabold tabular-nums leading-none">{formato(roundPoints)}</p>
                <p className="mt-1 text-[11px] font-bold" style={{ color: "var(--t-muted)" }}>{showingRound ? "PT de esta ronda" : "PT acumulados"}</p>
              </div>
            </div>
            <div className="mt-1">
              <StatLine label="Pronósticos realizados" value={stats?.predictionsMade ?? 0} />
              <StatLine label="Trivias acertadas" value={`${stats?.triviaCorrect ?? 0}/${stats?.triviaAnswered ?? 0}`} />
              <StatLine label="Ligas" value={leagues.length} />
              <StatLine label="Premios" value={stats?.prizesWon ?? 0} />
            </div>
          </ToboCard>
        </div>

        <div className="mt-5 flex items-center justify-between px-1">
          <h3 className="text-[14px] font-extrabold">Mis ligas</h3>
          <button type="button" onClick={() => navigate("/tobo/ligas")} className="text-[12px] font-extrabold" style={{ color: "var(--t-accent)" }}>
            Gestionar
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {leagues.length === 0 && (
            <p className="rounded-2xl px-4 py-4 text-[13px] font-semibold" style={{ backgroundColor: "var(--t-card)", color: "var(--t-muted)" }}>
              Aun no tienes ligas privadas.
            </p>
          )}
          {leagues.map((league) => (
            <button
              key={league.id}
              type="button"
              onClick={() => navigate(`/tobo/ligas/${league.id}`)}
              className="rounded-2xl px-4 py-3 text-left"
              style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-extrabold">{league.name}</p>
                <span className="text-[12px] font-bold" style={{ color: "var(--t-muted)" }}>{league.memberCount} participantes</span>
              </div>
            </button>
          ))}
        </div>

        <h3 className="mt-5 px-1 text-[14px] font-extrabold">Actividad reciente</h3>
        <div className="mt-2 flex flex-col gap-2 pb-2">
          {recent.length === 0 && (
            <p className="rounded-2xl px-4 py-4 text-[13px] font-semibold" style={{ backgroundColor: "var(--t-card)", color: "var(--t-muted)" }}>
              Todavia no hay movimientos de puntos.
            </p>
          )}
          {recent.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-2xl px-3 py-3"
              style={{ backgroundColor: "var(--t-card)", border: "1px solid var(--t-border)" }}
            >
              <p className="text-[13px] font-extrabold">{movementLabel(tx)}</p>
              <p className="text-[14px] font-extrabold tabular-nums" style={{ color: "var(--t-accent)" }}>+{formato(tx.points)}</p>
            </div>
          ))}
        </div>

        {isAdmin && (
          <ToboCard className="mt-5">
            <p className="text-[14px] font-extrabold">Super Admin</p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--t-muted)" }}>Partidos, locales, trivias, ciclos y demo.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Partidos", "/admin/partidos"],
                ["Locales", "/admin/tascas"],
                ["Trivias", "/admin/trivias"],
                ["Ciclos", "/admin/ciclos"],
                ["Ligas", "/admin/ligas"],
                ["Demo", "/admin/simulacion"],
              ].map(([label, to]) => (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(to)}
                  className="h-11 rounded-2xl text-[12px] font-extrabold"
                  style={{ backgroundColor: "var(--t-tint)", color: "var(--t-accent)" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </ToboCard>
        )}

        <button
          type="button"
          onClick={() => {
            replayLvbpOnboarding(currentUser.id);
            navigate("/tobo");
          }}
          className="mx-1 mt-6 min-h-11 text-[14px] font-extrabold"
          style={{ color: "var(--t-accent)" }}
        >
          Ver introducción de nuevo
        </button>
        <button type="button" onClick={logout} className="mx-1 mb-4 mt-3 text-[14px] font-extrabold text-[#E23B2F]">
          Cerrar sesion en este telefono
        </button>
      </div>
      <TabBar />
    </div>
  );
}
