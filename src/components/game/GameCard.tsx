import { IconBolt, IconFire, IconTrophy } from "@/components/ui/icons";
import { formato, gameTypeLabel } from "@/lib/format";
import type { Game } from "@/types/pulse";

export function GameCard({
  game,
  done,
  closed,
  onOpen,
}: {
  game: Game;
  done?: boolean;
  closed?: boolean;
  onOpen: () => void;
}) {
  const icon =
    game.type === "prediction" ? (
      <IconFire className="h-7 w-7" />
    ) : game.type === "quick_challenge" ? (
      <IconBolt className="h-7 w-7" />
    ) : (
      <IconTrophy className="h-7 w-7" />
    );

  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-[22px] bg-white p-3 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[#FF4F1A]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#FF4F1A]">{gameTypeLabel(game.type)}</p>
        <h4 className="truncate text-[15px] font-extrabold leading-tight">{game.title}</h4>
        <p className="truncate text-[12px] font-semibold text-[#8D7366]">{game.description}</p>
      </div>
      <div className="text-right">
        <p className="text-[14px] font-extrabold text-[#C47B12]">+{formato(game.points)}</p>
        <p className="text-[11px] font-bold text-[#A08B80]">{done ? "Hecho" : closed ? "Cerrada" : "Jugar"}</p>
      </div>
    </button>
  );
}
