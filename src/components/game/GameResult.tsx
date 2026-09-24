import { PrimaryButton } from "@/components/ui/Buttons";
import { IconTrophy } from "@/components/ui/icons";

export function GameResult({
  title,
  score,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  score: number;
  subtitle?: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFC53D] text-[#8A4E00]">
          <IconTrophy className="h-10 w-10" />
        </div>
        <h2 className="mt-4 text-[26px] font-extrabold">¡Listo!</h2>
        <p className="mt-1 text-[15px] font-semibold text-[#8D7366]">{title}</p>
        <p className="mt-4 text-[42px] font-extrabold leading-none tabular-nums">+{score}</p>
        <p className="mt-1 text-[13px] font-bold text-[#A08B80]">{subtitle ?? "puntos en esta partida"}</p>
      </div>
      <div className="px-4 pb-7">
        <PrimaryButton onClick={onAction}>{actionLabel}</PrimaryButton>
        {secondaryLabel && onSecondary && (
          <button type="button" onClick={onSecondary} className="mt-3 flex h-11 w-full items-center justify-center text-[14px] font-extrabold text-[#8D7366]">
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
