import { useNavigate } from "react-router-dom";
import { ExperienceCard } from "@/components/experience/ExperienceCard";
import { ExperienceHero } from "@/components/experience/ExperienceHero";
import { NextActionCard } from "@/components/experience/NextActionCard";
import { MissionCard } from "@/components/missions/MissionCard";
import { RewardCard } from "@/components/rewards/RewardCard";
import { IconCoin } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/LogoMark";
import { ProgressBar } from "@/components/ui/Shell";
import { TabBar } from "@/components/ui/TabBar";
import { destinationForRequirement } from "@/lib/continue";
import { formato } from "@/lib/format";
import { getNextStep } from "@/lib/nextAction";
import { rewardRepository, venueRepository } from "@/services/repositories";
import { usePulse } from "@/state/PulseContext";
import type { MissionRequirementType } from "@/types/pulse";

export function HomePage() {
  const navigate = useNavigate();
  const {
    featured,
    experiences,
    games,
    rewards,
    missions,
    totalPoints,
    experiencePoints,
    level,
    leaderboard,
    pointsToClimb,
    hasPlayed,
    setNotice,
  } = usePulse();

  const myRank = leaderboard.find((entry) => entry.isCurrentUser);
  const activeMission = missions.find((item) => !item.completed) ?? missions[0];
  const reward = rewards[0];
  const later = experiences.filter((item) => item.id !== featured.id);
  const step = getNextStep({ games, missions, hasPlayed, status: featured.status });

  function openStep() {
    if (step.kind === "play") {
      navigate(`/play/${step.game.id}`);
      return;
    }
    if (step.kind === "checkin") {
      navigate(`/experience/${featured.id}`);
      return;
    }
    if (step.kind === "done") {
      navigate("/ranking");
      return;
    }
  }

  function continueRequirement(type: MissionRequirementType) {
    const destination = destinationForRequirement(type, games, hasPlayed);
    if (destination.notice) {
      setNotice(destination.notice);
      if (type === "checkin") navigate(`/experience/${featured.id}`);
      return;
    }
    if (destination.gameId) navigate(`/play/${destination.gameId}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div>
            <p className="text-[18px] font-extrabold leading-none tracking-tight">Pulse</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#A08B80]">¿Qué puedes hacer ahora?</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-[0_6px_16px_rgba(80,40,10,0.08)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFC53D] text-[#8A4E00]">
            <IconCoin className="h-4 w-4" />
          </span>
          <span className="text-[13px] font-extrabold tabular-nums">{formato(totalPoints)}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <ExperienceHero experience={featured} players={leaderboard.length} onOpen={() => navigate(`/experience/${featured.id}`)} />

        <div className="mt-3 rounded-[22px] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(80,40,10,0.05)]">
          <div className="flex items-center justify-between text-[12px] font-extrabold">
            <span>Nivel {level.level}</span>
            <span className="text-[#8D7366]">{formato(level.pointsToNext)} pts para el siguiente</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={level.ratio} />
          </div>
        </div>

        <h3 className="mb-3 mt-5 text-[15px] font-extrabold leading-tight">Qué puedes hacer ahora</h3>
        <NextActionCard step={step} onAction={openStep} />

        {activeMission && (
          <div className="mt-3">
            <MissionCard progress={activeMission} compact onContinue={continueRequirement} />
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate("/challenges")}
          className="mt-3 w-full text-left text-[13px] font-extrabold text-[#FF4F1A]"
        >
          Ver todos los retos
        </button>

        <button
          type="button"
          onClick={() => navigate("/ranking")}
          className="mt-2 w-full rounded-[22px] bg-white px-4 py-3 text-left shadow-[0_8px_22px_rgba(80,40,10,0.06)]"
        >
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Ranking</p>
          <p className="mt-1 text-[18px] font-extrabold">
            #{myRank?.position ?? "—"} · {formato(experiencePoints)} pts
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#8D7366]">
            {pointsToClimb ? `Estás a ${formato(pointsToClimb)} puntos de subir 1 posición.` : "Vas primero. Sigue sumando."}
          </p>
        </button>

        {reward && (
          <div className="mt-3">
            <RewardCard reward={reward} points={experiencePoints} />
          </div>
        )}

        {later.length > 0 && (
          <>
            <h3 className="mb-3 mt-5 text-[15px] font-extrabold leading-tight">Después</h3>
            <div className="flex flex-col gap-2.5">
              {later.map((experience) => (
                <ExperienceCard
                  key={experience.id}
                  experience={experience}
                  venueCount={venueRepository.getByIds(experience.venueIds).length}
                  rewardName={rewardRepository.getByExperience(experience.id)[0]?.name}
                  onOpen={() => navigate(`/experience/${experience.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <TabBar />
    </div>
  );
}
