import { useNavigate } from "react-router-dom";
import { GameCard } from "@/components/game/GameCard";
import { MissionCard } from "@/components/missions/MissionCard";
import { TabBar } from "@/components/ui/TabBar";
import { destinationForRequirement } from "@/lib/continue";
import { isGamePlayable } from "@/lib/games";
import { usePulse } from "@/state/PulseContext";
import type { MissionRequirementType } from "@/types/pulse";

export function ChallengesPage() {
  const navigate = useNavigate();
  const { featured, games, missions, hasPlayed, setNotice } = usePulse();

  function continueRequirement(type: MissionRequirementType) {
    const destination = destinationForRequirement(type, games, hasPlayed);
    if (destination.notice) {
      setNotice(destination.notice);
      return;
    }
    if (destination.gameId) navigate(`/play/${destination.gameId}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">{featured.name}</p>
        <h2 className="text-[24px] font-extrabold tracking-tight">Retos</h2>
        <p className="text-[13px] font-semibold text-[#8D7366]">Toca uno para empezar. Hecho ya sumó puntos.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-2.5">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              done={hasPlayed(game.id)}
              closed={!hasPlayed(game.id) && !isGamePlayable(game)}
              onOpen={() => navigate(`/play/${game.id}`)}
            />
          ))}
        </div>
        {missions.length > 0 && (
          <div className="mt-5 flex flex-col gap-2.5">
            <h3 className="text-[14px] font-extrabold">Misiones</h3>
            {missions.map((mission) => (
              <MissionCard key={mission.mission.id} progress={mission} onContinue={continueRequirement} />
            ))}
          </div>
        )}
      </div>
      <TabBar />
    </div>
  );
}
