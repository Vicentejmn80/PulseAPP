import type { LeaderboardEntry } from "@/types/pulse";
import { RankingRow } from "./RankingRow";

export function RankingList({
  entries,
  subtitle,
  emptyLabel,
}: {
  entries: LeaderboardEntry[];
  subtitle?: string;
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-[28px] bg-white px-6 py-8 text-center">
        <p className="text-[15px] font-extrabold">{emptyLabel ?? "Todavía no hay ranking"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <RankingRow key={entry.user.id} entry={entry} subtitle={subtitle} />
      ))}
    </div>
  );
}
