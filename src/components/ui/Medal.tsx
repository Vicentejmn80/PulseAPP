import type { ReactNode } from "react";
import type { BadgeTone } from "@/types/pulse";

const tones: Record<BadgeTone, string> = {
  gold: "from-[#FFE7A3] to-[#F5B942] text-[#8A5A00] ring-[#FFE7A8]",
  fire: "from-[#FFB067] to-[#FF4F1A] text-white ring-[#FFD3C2]",
  bronze: "from-[#F0C2A0] to-[#C4845A] text-[#6B3A22] ring-[#F3D7C4]",
  rose: "from-[#FFB3C7] to-[#E23E6B] text-white ring-[#FFD0DC]",
};

export function Medal({
  tone,
  label,
  locked,
  children,
}: {
  tone: BadgeTone;
  label: string;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center gap-1.5 ${locked ? "opacity-35" : ""}`}>
      <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b shadow-[0_8px_16px_rgba(80,40,10,0.12)] ring-4 ${tones[tone]}`}>
        {children}
      </div>
      <span className="text-center text-[11px] font-extrabold leading-tight">{label}</span>
    </div>
  );
}
