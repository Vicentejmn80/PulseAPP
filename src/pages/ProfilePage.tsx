import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TabBar } from "@/components/ui/TabBar";
import { formato, gameTypeLabel } from "@/lib/format";
import { adminVenueList } from "@/services/demoApi";
import { listRanking, myPrizes, type ToboPrize } from "@/services/matchesApi";
import { listMyLeagues, type League } from "@/services/leaguesApi";
import { myStats, type UserStats } from "@/services/analytics";
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
  const { currentUser, totalPoints, transactions, logout, reload } = usePulse();
  const [position, setPosition] = useState<number | null>(null);
  const [rankPoints, setRankPoints] = useState<number | null>(null);
  const [prizes, setPrizes] = useState<ToboPrize[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listRanking("lifetime"), myPrizes(), listMyLeagues(), myStats()])
      .then(([, rows, prizeStatus, leagueRows, userStats]) => {
        if (!alive) return;
        const mine = rows.find((entry) => entry.isCurrentUser);
        setPosition(mine?.position ?? null);
        setRankPoints(mine?.points ?? null);
        setPrizes(prizeStatus.prizes ?? []);
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
    <div className="flex h-full flex-col bg-[#FFF7F1]">
      <div className="shrink-0 rounded-b-[32px] bg-gradient-to-b from-[#FF8A3C] to-[#FF4F1A] pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-center">
          <div className="rounded-full bg-white/25 p-1">
            <div
              className="flex h-[84px] w-[84px] items-center justify-center rounded-full text-[28px] font-extrabold text-white"
              style={{ background: currentUser.avatarColor }}
            >
              {currentUser.initials}
            </div>
          </div>
          <h2 className="mt-3 text-[24px] font-extrabold tracking-tight text-white">{currentUser.alias}</h2>
          <p className="text-[13px] font-bold text-white/80">{currentUser.handle}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        <div className="relative z-10 -mt-6 mx-4 rounded-[26px] bg-white px-4 py-4 text-center shadow-[0_12px_28px_rgba(80,40,10,0.08)]">
          <p className="text-[42px] font-extrabold leading-none tracking-tight tabular-nums">{formato(totalPoints)}</p>
          <p className="mt-1 text-[13px] font-bold text-[#A08B80]">puntos acumulados</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 px-4">
          <div className="rounded-[22px] bg-white p-3.5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#FF4F1A]">Ranking global</p>
            <p className="mt-1 text-[28px] font-extrabold leading-none">#{position ?? "—"}</p>
            <p className="mt-1 text-[12px] font-bold text-[#8D7366]">{formato(rankPoints ?? totalPoints)} pts</p>
          </div>
          <div className="rounded-[22px] bg-white p-3.5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#FF4F1A]">Mi actividad</p>
            <p className="mt-1 text-[14px] font-extrabold leading-snug">
              {stats?.predictionsMade ?? 0} pronosticos
            </p>
            <p className="text-[14px] font-extrabold leading-snug">
              {stats?.triviaCorrect ?? 0}/{stats?.triviaAnswered ?? 0} trivias
            </p>
            <p className="text-[14px] font-extrabold leading-snug">{leagues.length} ligas</p>
          </div>
        </div>

        {/* MIS LIGAS */}
        <div className="mt-5 px-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold">Mis ligas</h3>
            <button type="button" onClick={() => navigate("/tobo/ligas")} className="text-[12px] font-extrabold text-[#FF4F1A]">
              Gestionar
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2 px-4">
          {leagues.length === 0 && (
            <p className="rounded-2xl bg-white px-4 py-4 text-[13px] font-semibold text-[#8D7366]">Aun no tienes ligas privadas.</p>
          )}
          {leagues.map((league) => (
            <button
              key={league.id}
              type="button"
              onClick={() => navigate(`/tobo/ligas/${league.id}`)}
              className="rounded-2xl bg-white px-4 py-3 text-left"
            >
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-extrabold">{league.name}</p>
                <span className="text-[12px] font-bold text-[#8D7366]">{league.memberCount} participantes</span>
              </div>
            </button>
          ))}
        </div>

        {/* MIS PREMIOS */}
        <div className="mt-5 px-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold">Mis premios</h3>
            <button type="button" onClick={() => navigate("/tobo/premios")} className="text-[12px] font-extrabold text-[#FF4F1A]">
              Ver todos
            </button>
          </div>
        </div>
        {prizes.length > 0 && (
          <div className="mt-2 px-4">
            {prizes.slice(0, 2).map((prize) => (
              <div key={prize.id} className="rounded-[22px] bg-white px-4 py-4">
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#FF4F1A]">{prize.cycleName} · puesto {prize.rank}</p>
                <p className="mt-2 text-[28px] font-extrabold tracking-[0.14em]">{prize.code}</p>
                <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
                  {prize.status === "redeemed" ? "Tobo canjeado" : "Codigo de canje. Vence en 14 dias."}
                </p>
              </div>
            ))}
          </div>
        )}
        {prizes.length === 0 && (
          <p className="mx-4 mt-2 rounded-2xl bg-white px-4 py-4 text-[13px] font-semibold text-[#8D7366]">
            Aun no tienes premios. Sube en el ranking para ganar.
          </p>
        )}

        {/* CLAVE */}
        <div className="mt-5 px-5">
          <h3 className="text-[14px] font-extrabold">Otro telefono</h3>
        </div>
        <div className="mt-2 mx-4 rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
          <p className="text-[13px] font-semibold text-[#8D7366]">Entra con tu celular y esta clave. Los puntos son los mismos.</p>
          <p className="mt-2 text-[28px] font-extrabold tracking-[0.18em]">{currentUser.accessCode}</p>
        </div>

        {/* ACTIVIDAD */}
        <div className="mt-5 px-5">
          <h3 className="text-[14px] font-extrabold">Actividad reciente</h3>
        </div>
        <div className="mt-2 flex flex-col gap-2 px-4 pb-2">
          {recent.length === 0 && (
            <p className="rounded-2xl bg-white px-4 py-4 text-[13px] font-semibold text-[#8D7366]">Todavia no hay movimientos de puntos.</p>
          )}
          {recent.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
              <p className="text-[13px] font-extrabold">{movementLabel(tx)}</p>
              <p className="text-[14px] font-extrabold text-[#C47B12]">+{formato(tx.points)}</p>
            </div>
          ))}
        </div>

        {/* SUPER ADMIN */}
        {isAdmin && (
          <div className="mx-5 mt-5 rounded-[22px] bg-white px-4 py-4">
            <p className="text-[14px] font-extrabold">Super Admin</p>
            <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Partidos, tascas, trivias, ciclos y demo.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => navigate("/admin/partidos")} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Partidos</button>
              <button type="button" onClick={() => navigate("/admin/tascas")} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Tascas</button>
              <button type="button" onClick={() => navigate("/admin/trivias")} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Trivias</button>
              <button type="button" onClick={() => navigate("/admin/ciclos")} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Ciclos</button>
              <button type="button" onClick={() => navigate("/admin/ligas")} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Ligas</button>
              <button type="button" onClick={() => navigate("/admin/simulacion")} className="h-11 rounded-2xl bg-[#FFF1EA] text-[12px] font-extrabold text-[#FF4F1A]">Demo</button>
            </div>
          </div>
        )}

        <button type="button" onClick={logout} className="mx-5 mb-4 mt-6 text-[14px] font-extrabold text-[#E23B2F]">
          Cerrar sesion en este telefono
        </button>
      </div>
      <TabBar />
    </div>
  );
}
