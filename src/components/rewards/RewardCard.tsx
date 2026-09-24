import { IconTrophy } from "@/components/ui/icons";
import { formato } from "@/lib/format";
import type { Reward } from "@/types/pulse";

export function RewardCard({ reward, points }: { reward: Reward; points: number }) {
  const unlocked = points >= reward.pointsRequired;
  const ratio = Math.min(1, points / reward.pointsRequired);

  return (
    <div className="flex items-center gap-3 rounded-[24px] bg-gradient-to-r from-[#FFF4D8] to-[#FFE7BF] p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFC53D] text-[#8A4E00]">
        <IconTrophy className="h-7 w-7" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#C47B12]">
          {unlocked ? "Desbloqueado" : "Premio"}
        </p>
        <p className="mt-0.5 text-[16px] font-extrabold leading-tight">{reward.name}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div className="h-full rounded-full bg-[#FF4F1A]" style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="mt-1 text-[11px] font-bold text-[#8D7366]">
          {unlocked
            ? "Listo. El canje en la tasca se activa en la siguiente fase."
            : `Te faltan ${formato(reward.pointsRequired - points)} pts`}
        </p>
      </div>
    </div>
  );
}
