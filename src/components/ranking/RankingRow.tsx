import { Avatar } from "@/components/ui/Avatar";
import { formato } from "@/lib/format";
import type { LeaderboardEntry } from "@/types/pulse";

export function RankingRow({ entry, subtitle }: { entry: LeaderboardEntry; subtitle?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${
        entry.isCurrentUser ? "bg-[#FFF1EA] ring-1 ring-[#FFD3C2]" : "bg-white shadow-[0_6px_16px_rgba(80,40,10,0.04)]"
      }`}
    >
      <span className={`w-6 text-center text-[16px] font-extrabold ${entry.position === 1 ? "text-[#E0A106]" : "text-[#B6A297]"}`}>
        {entry.position}
      </span>
      <Avatar initials={entry.user.initials} bg={entry.user.avatarColor} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-extrabold">
          {entry.user.alias}
          {entry.isCurrentUser && (
            <span className="rounded-full bg-[#FF4F1A] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">Tú</span>
          )}
        </p>
        <p className="truncate text-[12px] font-semibold text-[#A08B80]">{subtitle ?? entry.user.handle}</p>
      </div>
      <p className="font-extrabold tabular-nums">
        {formato(entry.points)}
        <span className="ml-0.5 text-[11px] font-bold text-[#A08B80]">pts</span>
      </p>
    </div>
  );
}
