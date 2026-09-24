import { gameTypeLabel } from "@/lib/format";
import type { GameType } from "@/types/pulse";

export function GameTypeBadge({ type }: { type: GameType }) {
  return (
    <span className="rounded-full bg-[#FFF1EA] px-2 py-0.5 text-[11px] font-extrabold text-[#FF4F1A]">
      {gameTypeLabel(type)}
    </span>
  );
}
