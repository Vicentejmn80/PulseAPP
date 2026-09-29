import { useEffect, useState } from "react";
import { IconMedal } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { StreakPanel } from "@/components/tobo/PilotExtras";
import { formato, gameTypeLabel } from "@/lib/format";
import { listRanking, myPrizes, type ToboPrize } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { PointsTransaction } from "@/types/pulse";

function movementLabel(tx: PointsTransaction) {
  if (tx.sourceType === "prediction" && tx.metadata) {
    return `Predicción · +${tx.metadata.winnerPoints ?? 0} ganador · +${tx.metadata.closenessPoints ?? 0} cercanía`;
  }
  return gameTypeLabel(tx.sourceType);
}

export function ProfilePage() {
  const { currentUser, totalPoints, transactions, logout, reload } = usePulse();
  const [position, setPosition] = useState<number | null>(null);
  const [rankPoints, setRankPoints] = useState<number | null>(null);
  const [prizes, setPrizes] = useState<ToboPrize[]>([]);
  const [eligible, setEligible] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listRanking("lifetime"), myPrizes()])
      .then(([, rows, prizeStatus]) => {
        if (!alive) return;
        const mine = rows.find((entry) => entry.isCurrentUser);
        setPosition(mine?.position ?? null);
        setRankPoints(mine?.points ?? null);
        setPrizes(prizeStatus.prizes ?? []);
        setEligible(prizeStatus.eligible);
      })
      .catch(() => {
        if (alive) setPosition(null);
      });
    return () => {
      alive = false;
    };
  }, [reload]);
  const recent = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="flex h-full flex-col bg-[#FFF7F1]">
      <div className="shrink-0 rounded-b-[32px] bg-gradient-to-b from-[#FF8A3C] to-[#FF4F1A] pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="rounded-full bg-white/25 p-1">
              <div
                className="flex h-[84px] w-[84px] items-center justify-center rounded-full text-[28px] font-extrabold text-white"
                style={{ background: currentUser.avatarColor }}
              >
                {currentUser.initials}
              </div>
            </div>
          </div>
          <h2 className="mt-3 text-[24px] font-extrabold tracking-tight text-white">{currentUser.alias}</h2>
          <p className="text-[13px] font-bold text-white/80">{currentUser.handle}</p>
          {currentUser.phone && <p className="mt-1 text-[12px] font-semibold text-white/75">Celular privado {currentUser.phone}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="relative z-10 -mt-8 mx-4 rounded-[26px] bg-white px-4 py-4 text-center shadow-[0_12px_28px_rgba(80,40,10,0.08)]">
          <p className="text-[42px] font-extrabold leading-none tracking-tight tabular-nums">{formato(totalPoints)}</p>
          <p className="mt-1 text-[13px] font-bold text-[#A08B80]">puntos acumulados</p>
        </div>
        <div className="mt-3 px-4">
          <StreakPanel />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 px-4">
          <div className="rounded-[22px] bg-white p-3.5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#FF4F1A]">Octubre</p>
            <p className="mt-1 text-[16px] font-extrabold leading-snug">{eligible ? "Puedes ganar un tobo" : "Ya ganaste tu tobo"}</p>
            <p className="mt-2 text-[12px] font-semibold text-[#8D7366]">Un tobo por persona en el mes.</p>
          </div>
          <div className="flex flex-col rounded-[22px] bg-white p-3.5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <div className="flex items-center gap-1.5 text-[#E0A106]">
              <IconMedal className="h-5 w-5" />
              <span className="text-[11px] font-extrabold uppercase tracking-wide">Ranking</span>
            </div>
            <p className="mt-1 text-[28px] font-extrabold leading-none">#{position ?? "—"}</p>
            <p className="mt-1 text-[12px] font-bold leading-snug text-[#8D7366]">Puntos acumulados</p>
            <p className="mt-auto pt-2 text-[11px] font-extrabold text-[#FF4F1A]">{formato(rankPoints ?? totalPoints)} pts</p>
          </div>
        </div>
        {prizes.length > 0 && (
          <div className="mt-4 px-4">
            {prizes.map((prize) => (
              <div key={prize.id} className="rounded-[22px] bg-white px-4 py-4">
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#FF4F1A]">{prize.cycleName} · puesto {prize.rank}</p>
                <p className="mt-2 text-[28px] font-extrabold tracking-[0.14em]">{prize.code}</p>
                <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">
                  {prize.status === "redeemed" ? "Tobo canjeado" : "Código de canje. Vence en 14 días."}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 px-5">
          <h3 className="text-[14px] font-extrabold">Otro teléfono</h3>
          <div className="mt-2 rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[13px] font-semibold text-[#8D7366]">Entra con tu celular y esta clave. Los puntos son los mismos.</p>
            <p className="mt-2 text-[28px] font-extrabold tracking-[0.18em]">{currentUser.accessCode}</p>
          </div>
        </div>
        <div className="mt-5 px-5">
          <h3 className="text-[14px] font-extrabold">Actividad reciente</h3>
        </div>
        <div className="mt-2 flex flex-col gap-2 px-4 pb-2">
          {recent.length === 0 && (
            <p className="rounded-2xl bg-white px-4 py-4 text-[13px] font-semibold text-[#8D7366]">Todavía no hay movimientos de puntos.</p>
          )}
          {recent.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
              <p className="text-[13px] font-extrabold">{movementLabel(tx)}</p>
              <p className="text-[14px] font-extrabold text-[#C47B12]">+{formato(tx.points)}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={logout} className="mx-5 mb-4 mt-4 text-[14px] font-extrabold text-[#E23B2F]">
          Cerrar sesión en este teléfono
        </button>
      </div>
      <TabBar />
    </div>
  );
}
