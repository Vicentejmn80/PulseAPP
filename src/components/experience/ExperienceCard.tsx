import { IconPin, IconTrophy } from "@/components/ui/icons";
import type { Experience } from "@/types/pulse";
import { ExperienceThumb } from "./ExperienceThumb";

export function ExperienceCard({
  experience,
  venueCount,
  rewardName,
  onOpen,
}: {
  experience: Experience;
  venueCount: number;
  rewardName?: string;
  onOpen: () => void;
}) {
  const upcoming = experience.status === "upcoming";
  return (
    <button type="button" onClick={onOpen} className="flex w-full gap-3 rounded-[22px] bg-white p-2.5 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]">
      <ExperienceThumb experience={experience} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#FF4F1A]">
          {experience.category}
          {upcoming && <span className="rounded-full bg-[#FFF1EA] px-1.5 py-0.5 text-[9px] tracking-wide text-[#FF4F1A]">Pronto</span>}
        </p>
        <h4 className="truncate text-[15px] font-extrabold leading-tight">{experience.name}</h4>
        <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-[#8D7366]">
          <IconPin className="h-3.5 w-3.5 text-[#FF4F1A]" />
          <span className="truncate">
            {venueCount > 0 ? `${venueCount} lugares participantes` : "Próximamente"}
          </span>
        </p>
        {rewardName && (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[12px] font-bold text-[#C47B12]">
            <IconTrophy className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{rewardName}</span>
          </p>
        )}
      </div>
    </button>
  );
}
