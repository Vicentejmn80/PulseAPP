import { PrimaryButton } from "@/components/ui/Buttons";
import type { NextStep } from "@/lib/nextAction";

export function NextActionCard({ step, onAction }: { step: NextStep; onAction: () => void }) {
  const title = step.kind === "play" ? step.game.title : step.title;
  const button =
    step.kind === "play" ? "Jugar ahora" : step.kind === "checkin" ? "Ver tascas" : step.kind === "done" ? "Ver ranking" : "Entendido";

  return (
    <div className="rounded-[24px] bg-white p-4 shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Ahora</p>
      <h3 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight">{title}</h3>
      <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">{step.detail}</p>
      <div className="mt-4">
        <PrimaryButton onClick={onAction}>{button}</PrimaryButton>
      </div>
    </div>
  );
}
