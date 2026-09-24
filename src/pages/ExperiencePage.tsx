import { useNavigate, useParams } from "react-router-dom";
import { ExperienceThumb } from "@/components/experience/ExperienceThumb";
import { GameCard } from "@/components/game/GameCard";
import { MissionCard } from "@/components/missions/MissionCard";
import { RankingList } from "@/components/ranking/RankingList";
import { RewardCard } from "@/components/rewards/RewardCard";
import { BackButton } from "@/components/ui/Buttons";
import { IconPin } from "@/components/ui/icons";
import { destinationForRequirement } from "@/lib/continue";
import { isGamePlayable } from "@/lib/games";
import { getMissionProgress } from "@/lib/missions";
import { getNextStep } from "@/lib/nextAction";
import {
  experienceRepository,
  gameRepository,
  missionRepository,
  rewardRepository,
  venueRepository,
} from "@/services/repositories";
import { usePulse } from "@/state/PulseContext";

export function ExperiencePage() {
  const { experienceId } = useParams();
  const navigate = useNavigate();
  const { extraGames, experiencePoints, hasPlayed, leaderboard, participations, featured, games: featuredGames, missions: featuredMissions, setNotice } = usePulse();
  const experience = experienceRepository.getById(experienceId ?? "") ?? featured;
  const venues = venueRepository.getByIds(experience.venueIds);
  const games = gameRepository.getByExperience(experience.id, extraGames);
  const missions = missionRepository
    .getByExperience(experience.id)
    .map((mission) => getMissionProgress(mission, participations.filter((item) => item.experienceId === experience.id)));
  const rewards = rewardRepository.getByExperience(experience.id);
  const step =
    experience.id === featured.id
      ? getNextStep({ games: featuredGames, missions: featuredMissions, hasPlayed, status: experience.status })
      : getNextStep({ games, missions, hasPlayed, status: experience.status });

  function continueRequirement(type: Parameters<typeof destinationForRequirement>[0]) {
    const destination = destinationForRequirement(type, games, hasPlayed);
    if (destination.notice) {
      setNotice(destination.notice);
      return;
    }
    if (destination.gameId) navigate(`/play/${destination.gameId}`);
  }

  function openStep() {
    if (step.kind === "play") navigate(`/play/${step.game.id}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate(-1)} />
        <p className="flex-1 pr-9 text-center text-[15px] font-extrabold">Experiencia</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-3">
        <div className="flex flex-col items-center px-6 pt-2">
          <ExperienceThumb experience={experience} large />
          <h2 className="mt-3 text-center text-[24px] font-extrabold tracking-tight">{experience.name}</h2>
          <p className="text-[13px] font-semibold text-[#8D7366]">{experience.category}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F8EE] px-2.5 py-1 text-[11px] font-bold text-[#1C8A4A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1C8A4A]" />
              {experience.status === "active" ? "Activa" : "Pronto"}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#8D7366]">
              <IconPin className="h-3.5 w-3.5 text-[#FF4F1A]" />
              {venues.length} lugares
            </span>
          </div>
          <p className="mt-3 max-w-[320px] text-center text-[13px] font-semibold text-[#8D7366]">{experience.description}</p>
          {experience.id === "exp_tobo" && (
            <button type="button" onClick={() => navigate("/mission/route_tobo")} className="mt-4 text-[14px] font-extrabold text-[#FF4F1A]">
              Ver La Ruta del Tobo
            </button>
          )}
        </div>

        {rewards[0] && (
          <div className="mx-4 mt-4">
            <RewardCard reward={rewards[0]} points={experience.id === featured.id ? experiencePoints : 0} />
          </div>
        )}

        {venues.length > 0 && (
          <div className="mx-4 mt-3 rounded-[20px] bg-white px-3.5 py-3 shadow-[0_8px_20px_rgba(80,40,10,0.05)]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#A08B80]">Establecimientos</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {venues.map((venue) => (
                <p key={venue.id} className="text-[13px] font-bold">
                  {venue.name}
                  <span className="ml-1 font-semibold text-[#8D7366]">· {venue.city}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 px-4">
          <h3 className="mb-2 text-[14px] font-extrabold">Qué puedes jugar</h3>
          {games.length === 0 ? (
            <p className="rounded-[22px] bg-white px-4 py-4 text-[13px] font-semibold text-[#8D7366]">
              Cuando abra, aquí aparecen la predicción, la trivia y el reto.
            </p>
          ) : (
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
          )}
        </div>

        {missions.length > 0 && (
          <div className="mt-5 px-4">
            <h3 className="mb-2 text-[14px] font-extrabold">Misiones</h3>
            <div className="flex flex-col gap-2.5">
              {missions.map((mission) => (
                <MissionCard key={mission.mission.id} progress={mission} onContinue={continueRequirement} />
              ))}
            </div>
          </div>
        )}

        {experience.id === featured.id && (
          <div className="mt-5 px-4 pb-4">
            <h3 className="mb-2 text-[14px] font-extrabold">Top de la semana</h3>
            <RankingList entries={leaderboard.slice(0, 3)} subtitle={experience.name} />
          </div>
        )}
      </div>
      {step.kind === "play" && (
        <div className="shrink-0 bg-[#FFF7F1] px-4 pb-7 pt-3">
          <button
            type="button"
            onClick={openStep}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#FF4F1A] text-[17px] font-extrabold text-white shadow-[0_12px_24px_rgba(255,79,26,0.35)]"
          >
            {step.game.title}
          </button>
        </div>
      )}
    </div>
  );
}
