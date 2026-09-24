import { useNavigate, useParams } from "react-router-dom";
import { PredictionPlay } from "@/components/game/PredictionPlay";
import { QuickChallengePlay } from "@/components/game/QuickChallengePlay";
import { TriviaPlay } from "@/components/game/TriviaPlay";
import { getNextStep, nextStepLabel } from "@/lib/nextAction";
import { gameRepository } from "@/services/repositories";
import { usePulse } from "@/state/PulseContext";

export function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { extraGames, featured, games, missions, hasPlayed, completeGame, submitPrediction, predictionPicks, setNotice } = usePulse();
  const game = gameRepository.getById(gameId ?? "", extraGames);
  const step = getNextStep({
    games,
    missions,
    hasPlayed,
    status: featured.status,
    excludeGameId: game?.id,
  });
  const continueLabel = nextStepLabel(step);

  function leave() {
    navigate(game ? `/experience/${game.experienceId}` : "/");
  }

  function goNext() {
    if (step.kind === "play") {
      navigate(`/play/${step.game.id}`);
      return;
    }
    if (step.kind === "checkin") {
      setNotice(step.detail);
      navigate(`/experience/${featured.id}`);
      return;
    }
    navigate("/");
  }

  if (!game) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[18px] font-extrabold">Esta actividad no está disponible</p>
        <button type="button" onClick={() => navigate("/")} className="mt-4 text-[14px] font-extrabold text-[#FF4F1A]">
          Volver al inicio
        </button>
      </div>
    );
  }

  const played = hasPlayed(game.id);
  const shared = { continueLabel, onContinue: goNext, onExit: leave };

  if (game.configuration.kind === "trivia") {
    return (
      <TriviaPlay
        title={game.title}
        category={featured.category}
        config={game.configuration}
        alreadyPlayed={played}
        {...shared}
        onFinish={(answers) => {
          void completeGame({ game, answers }).then((awarded) => {
            if (awarded > 0) setNotice(`Sumaste ${awarded} puntos`);
          });
        }}
      />
    );
  }

  if (game.configuration.kind === "prediction") {
    return (
      <PredictionPlay
        title={game.title}
        points={game.points}
        config={game.configuration}
        selectedOptionId={predictionPicks[game.id]}
        alreadyPlayed={played}
        {...shared}
        onSubmit={(optionId) => {
          void submitPrediction(game, optionId).then((awarded) => {
            if (awarded > 0) setNotice(`Sumaste ${awarded} puntos`);
          });
        }}
      />
    );
  }

  return (
    <QuickChallengePlay
      title={game.title}
      config={game.configuration}
      alreadyPlayed={played}
      {...shared}
      onFinish={(answer) => {
        void completeGame({ game, answer }).then((awarded) => {
          if (awarded > 0) setNotice(`Sumaste ${awarded} puntos`);
        });
      }}
    />
  );
}
