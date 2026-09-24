import type { ExperienceStatus, Game, MissionProgress } from "@/types/pulse";
import { isGamePlayable } from "./games";

export type NextStep =
  | { kind: "play"; game: Game; detail: string }
  | { kind: "checkin"; title: string; detail: string }
  | { kind: "done"; title: string; detail: string }
  | { kind: "upcoming"; title: string; detail: string };

export function getNextStep(input: {
  games: Game[];
  missions: MissionProgress[];
  hasPlayed: (gameId: string) => boolean;
  status: ExperienceStatus;
  excludeGameId?: string;
}): NextStep {
  if (input.status !== "active") {
    return {
      kind: "upcoming",
      title: "Esta experiencia todavía no abre",
      detail: "Cuando esté activa, aquí aparece lo primero que puedes jugar.",
    };
  }

  const playable = (game: Game) =>
    game.id !== input.excludeGameId && !input.hasPlayed(game.id) && isGamePlayable(game);

  const mission = input.missions.find(
    (item) => !item.completed && item.requirementProgress.some((req) => req.requirement.type !== "checkin"),
  );

  if (mission) {
    for (const item of mission.requirementProgress) {
      if (item.done || item.requirement.type === "checkin") continue;
      const game = input.games.find((candidate) => candidate.type === item.requirement.type && playable(candidate));
      if (game) {
        return { kind: "play", game, detail: `Cuenta para ${mission.mission.title}` };
      }
    }
  }

  const extra = input.games.find(playable);
  if (extra) {
    return { kind: "play", game: extra, detail: "Siguiente actividad" };
  }

  const checkinLeft = input.missions.some((item) =>
    item.requirementProgress.some((req) => req.requirement.type === "checkin" && !req.done),
  );
  if (checkinLeft) {
    return {
      kind: "checkin",
      title: "Check-in en la tasca",
      detail: "Eso se hace en el local. El QR todavía no está activo.",
    };
  }

  return {
    kind: "done",
    title: "Listo por hoy",
    detail: "Ya hiciste lo que está abierto. Vuelve cuando haya una predicción nueva.",
  };
}

export function nextStepLabel(step: NextStep) {
  if (step.kind === "play") return `Siguiente · ${step.game.title}`;
  if (step.kind === "checkin") return "Ver tascas";
  if (step.kind === "upcoming") return "Volver";
  return "Volver al inicio";
}
