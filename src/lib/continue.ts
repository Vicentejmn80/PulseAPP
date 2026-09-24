import type { Game, MissionRequirementType } from "@/types/pulse";
import { isGamePlayable } from "./games";

export function destinationForRequirement(type: MissionRequirementType, games: Game[], hasPlayed: (gameId: string) => boolean) {
  if (type === "checkin") {
    return { notice: "El check-in se hace en la tasca. El QR todavía no está activo." };
  }
  const open = games.find((game) => game.type === type && !hasPlayed(game.id) && isGamePlayable(game));
  const any = games.find((game) => game.type === type);
  const game = open ?? any;
  if (!game) return { notice: "Esa actividad no está abierta ahora." };
  return { gameId: game.id };
}
