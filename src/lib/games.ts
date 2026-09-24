import type { Game } from "@/types/pulse";

export function isGamePlayable(game: Game, now = Date.now()) {
  if (game.status !== "open") return false;
  if (game.configuration.kind !== "prediction") return true;
  const openAt = Date.parse(game.configuration.openAt);
  const closeAt = Date.parse(game.configuration.closeAt);
  return now >= openAt && now < closeAt;
}
