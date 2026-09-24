import { useState } from "react";
import { RankingList } from "@/components/ranking/RankingList";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { usePulse } from "@/state/PulseContext";

export function RankingPage() {
  const { featured, leaderboard, weeklyLeaderboard, pointsToClimb } = usePulse();
  const [period, setPeriod] = useState<"all_time" | "weekly">("all_time");
  const entries = period === "weekly" ? weeklyLeaderboard : leaderboard;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{featured.name}</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Ranking</h2>
        <p className="text-[13px] font-semibold text-[#8D7366]">
          {pointsToClimb ? `Estás a ${formato(pointsToClimb)} puntos de subir 1 posición.` : "Estás en lo más alto."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["all_time", "General"],
              ["weekly", "Semana"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={`h-11 rounded-2xl text-[13px] font-extrabold ${period === id ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <RankingList entries={entries} subtitle={featured.name} />
      </div>
      <TabBar />
    </div>
  );
}
