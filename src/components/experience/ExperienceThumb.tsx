import { IconFire, IconTrophy, PulseArt } from "@/components/ui/icons";
import type { Experience } from "@/types/pulse";

export function ExperienceThumb({ experience, large = false }: { experience: Experience; large?: boolean }) {
  const box = large
    ? "flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-[26px] shadow-[0_12px_24px_rgba(255,79,26,0.22)]"
    : "flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-[18px]";

  const icon =
    experience.visual.icon === "trophy" ? (
      <IconTrophy className="h-9 w-9 text-white" />
    ) : experience.visual.icon === "bolt" ? (
      <PulseArt className="h-9 w-9 text-white" />
    ) : (
      <IconFire className="h-9 w-9 text-white" />
    );

  return <div className={`${box} bg-gradient-to-br ${experience.visual.gradient}`}>{icon}</div>;
}
