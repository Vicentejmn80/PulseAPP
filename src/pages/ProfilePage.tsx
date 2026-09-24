import { IconBolt, IconFire, IconMedal, IconTrophy } from "@/components/ui/icons";
import { Medal } from "@/components/ui/Medal";
import { ProgressBar } from "@/components/ui/Shell";
import { TabBar } from "@/components/ui/TabBar";
import { formato, gameTypeLabel } from "@/lib/format";
import { getBadges } from "@/services/repositories";
import { usePulse } from "@/state/PulseContext";

const badgeIcon = {
  trophy: IconTrophy,
  fire: IconFire,
  medal: IconMedal,
  bolt: IconBolt,
};

export function ProfilePage() {
  const { currentUser, totalPoints, experiencePoints, level, leaderboard, earnedBadges, transactions, featured, logout } = usePulse();
  const myRank = leaderboard.find((entry) => entry.isCurrentUser);
  const recent = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const allBadges = getBadges();

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
            <div className="absolute -bottom-0.5 -right-0.5 flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-extrabold text-[#FF4F1A] shadow">
              {level.level}
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
          <p className="mt-1 text-[13px] font-bold text-[#A08B80]">puntos totales</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 px-4">
          <div className="rounded-[22px] bg-white p-3.5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <div className="flex items-center gap-1.5 text-[#FF4F1A]">
              <IconFire className="h-5 w-5" />
              <span className="text-[11px] font-extrabold uppercase tracking-wide">Nivel {level.level}</span>
            </div>
            <p className="mt-1 text-[28px] font-extrabold leading-none">
              {level.level}
              <span className="ml-1 text-[13px] font-bold text-[#A08B80]">nivel</span>
            </p>
            <div className="mt-2.5">
              <ProgressBar value={level.ratio} />
              <p className="mt-1.5 text-[11px] font-bold text-[#8D7366]">
                {formato(level.pointsToNext)} para el nivel {level.level + 1}
              </p>
            </div>
          </div>
          <div className="flex flex-col rounded-[22px] bg-white p-3.5 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <div className="flex items-center gap-1.5 text-[#E0A106]">
              <IconMedal className="h-5 w-5" />
              <span className="text-[11px] font-extrabold uppercase tracking-wide">Ranking</span>
            </div>
            <p className="mt-1 text-[28px] font-extrabold leading-none">#{myRank?.position ?? "—"}</p>
            <p className="mt-1 text-[12px] font-bold leading-snug text-[#8D7366]">{featured.name}</p>
            <p className="mt-auto pt-2 text-[11px] font-extrabold text-[#FF4F1A]">{formato(experiencePoints)} pts en esta experiencia</p>
          </div>
        </div>
        <div className="mt-4 px-5">
          <h3 className="text-[14px] font-extrabold">Insignias</h3>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 px-4">
          {allBadges.map((badge) => {
            const Icon = badgeIcon[badge.icon];
            return (
              <Medal key={badge.id} tone={badge.tone} label={badge.name} locked={!earnedBadges.some((item) => item.id === badge.id)}>
                <Icon className="h-7 w-7" />
              </Medal>
            );
          })}
        </div>
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
              <p className="text-[13px] font-extrabold">{gameTypeLabel(tx.sourceType)}</p>
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
