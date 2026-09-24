import { IconFire, IconPeople, PulseArt } from "@/components/ui/icons";
import { formato } from "@/lib/format";
import type { Experience } from "@/types/pulse";

export function ExperienceHero({
  experience,
  players,
  onOpen,
}: {
  experience: Experience;
  players: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative block h-[214px] w-full overflow-hidden rounded-[28px] bg-gradient-to-br ${experience.visual.gradient} text-left shadow-[0_16px_32px_rgba(255,79,26,0.28)]`}
    >
      <div className="absolute -right-6 -top-8 h-36 w-36 rounded-full bg-white/15" />
      <PulseArt className="pointer-events-none absolute -right-2 bottom-4 h-28 w-28 text-white/25" />
      <div className="relative flex h-full max-w-[240px] flex-col p-5">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">
          <IconFire className="h-3 w-3" />
          Activa
        </span>
        <h2 className="mt-3 line-clamp-3 text-[26px] font-extrabold leading-[1.05] tracking-tight text-white">{experience.name}</h2>
        <p className="mt-1.5 text-[15px] font-bold text-white/95">{experience.category}</p>
        <div className="mt-auto">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2.5 py-1 text-[11px] font-bold text-white">
            <IconPeople className="h-3.5 w-3.5" />
            {formato(players)} jugando
          </span>
        </div>
      </div>
    </button>
  );
}
