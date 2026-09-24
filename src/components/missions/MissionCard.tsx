import { requirementLabel } from "@/lib/format";
import type { MissionProgress, MissionRequirementType } from "@/types/pulse";

export function MissionCard({
  progress,
  compact = false,
  onContinue,
}: {
  progress: MissionProgress;
  compact?: boolean;
  onContinue?: (type: MissionRequirementType) => void;
}) {
  const { mission, completed, requirementProgress } = progress;
  const next = requirementProgress.find((item) => !item.done);

  return (
    <div className="rounded-[24px] bg-white p-4 shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Misión</p>
          <h3 className="mt-0.5 text-[16px] font-extrabold leading-tight">{mission.title}</h3>
          {!compact && <p className="mt-1 text-[12px] font-semibold text-[#8D7366]">{mission.description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-[#FFF4D8] px-2.5 py-1 text-[12px] font-extrabold text-[#C47B12]">+{mission.points}</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {requirementProgress.map((item) => {
          const canOpen = Boolean(onContinue) && !item.done;
          const label = `${requirementLabel(item.requirement.type)} ${item.current}/${item.requirement.count}`;
          const row = (
            <>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${item.done ? "bg-[#E8F8EE] text-[#1C8A4A]" : "bg-[#FFF1EA] text-[#FF4F1A]"}`}
              >
                {item.done ? "✓" : "○"}
              </span>
              <span className={item.done ? "text-[#1C8A4A]" : "text-[#241710]"}>{label}</span>
              {canOpen && <span className="ml-auto text-[11px] font-extrabold text-[#FF4F1A]">Ir</span>}
            </>
          );

          if (!canOpen) {
            return (
              <p key={item.requirement.id} className="flex items-center gap-2 text-[13px] font-bold">
                {row}
              </p>
            );
          }

          return (
            <button
              key={item.requirement.id}
              type="button"
              onClick={() => onContinue?.(item.requirement.type)}
              className="flex items-center gap-2 rounded-xl text-left text-[13px] font-bold"
            >
              {row}
            </button>
          );
        })}
      </div>
      {completed && <p className="mt-3 text-[12px] font-extrabold text-[#1C8A4A]">Completada. Los puntos ya están en tu historial.</p>}
      {!completed && next && compact && <p className="mt-3 text-[12px] font-semibold text-[#8D7366]">Toca lo que falta para hacerlo ahora.</p>}
    </div>
  );
}
