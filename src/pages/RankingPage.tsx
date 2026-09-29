import { useEffect, useState } from "react";
import { RankingList } from "@/components/ranking/RankingList";
import { TabBar } from "@/components/ui/TabBar";
import { formato } from "@/lib/format";
import { listCycles, listRanking, type ToboCycle } from "@/services/matchesApi";
import { usePulse } from "@/state/PulseContext";
import type { LeaderboardEntry } from "@/types/pulse";

const periods = [
  ["ronda_1", "12–16"],
  ["ronda_2", "17–23"],
  ["ronda_3", "24–30"],
  ["lifetime", "Total"],
] as const;

export function RankingPage() {
  const { reload } = usePulse();
  const [cycle, setCycle] = useState<(typeof periods)[number][0]>("ronda_1");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [cycles, setCycles] = useState<ToboCycle[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([reload(), listCycles(), listRanking(cycle)])
      .then(([, roundRows, rows]) => {
        if (!alive) return;
        setCycles(roundRows);
        setEntries(rows);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo cargar el ranking.");
      });
    return () => {
      alive = false;
    };
  }, [cycle, reload]);

  const me = entries.find((entry) => entry.isCurrentUser);
  const round = cycles.find((item) => item.id === cycle);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Juégate el Tobo</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Ranking</h2>
        <p className="text-[13px] font-semibold text-[#8D7366]">
          {me ? `Vas #${me.position} con ${formato(me.points)} pts${cycle === "lifetime" ? "" : " en esta ronda"}.` : "Tres tobos por ronda."}
        </p>
        {round && <p className="text-[12px] font-bold text-[#A08B80]">{round.startsOn} al {round.endsOn}</p>}
        <div className="mt-3 grid grid-cols-4 gap-1">
          {periods.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCycle(id)}
              className={`h-11 rounded-2xl text-[12px] font-extrabold ${cycle === id ? "bg-[#FF4F1A] text-white" : "bg-white text-[#8D7366]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}
        <RankingList entries={entries} subtitle={cycle === "lifetime" ? "Puntos acumulados" : "Puntos de la ronda"} emptyLabel="Todavía no hay jugadores" />
      </div>
      <TabBar />
    </div>
  );
}
