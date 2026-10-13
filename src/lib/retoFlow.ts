import type { BaseballMatch } from "@/services/matchesApi";

export const OPEN_GAME_PAGE = 4;

export function openRetoGames(matches: BaseballMatch[], now = Date.now()) {
  return matches
    .filter((match) => !match.demo && !match.simulation && match.status === "scheduled" && new Date(match.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function visibleRetoGames(matches: BaseballMatch[], expanded = false, now = Date.now()) {
  const open = openRetoGames(matches, now);
  return {
    open,
    visible: expanded ? open : open.slice(0, OPEN_GAME_PAGE),
    hidden: Math.max(0, open.length - OPEN_GAME_PAGE),
  };
}

export function closesInLabel(startsAt: string, now = Date.now()) {
  const ms = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "ya cerró";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return `cierra en ${days} ${days === 1 ? "día" : "días"}`;
  }
  if (hours > 0) return `cierra en ${hours} h`;
  return `cierra en ${Math.max(minutes, 1)} min`;
}
