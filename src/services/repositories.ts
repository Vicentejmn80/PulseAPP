import {
  BADGES,
  EXPERIENCES,
  GAMES,
  MISSIONS,
  REWARDS,
  SEED_TRANSACTIONS,
  USERS,
  VENUES,
} from "@/data/mock";
import type { Game, PointsTransaction } from "@/types/pulse";

export function getUsers() {
  return USERS;
}

export function getCurrentUser(userId: string) {
  return USERS.find((user) => user.id === userId);
}

export function getExperiences() {
  return EXPERIENCES;
}

export function getActiveExperiences() {
  return EXPERIENCES.filter((experience) => experience.status === "active");
}

export function getExperienceById(id: string) {
  return EXPERIENCES.find((experience) => experience.id === id);
}

export function getVenuesByIds(ids: string[]) {
  return VENUES.filter((venue) => ids.includes(venue.id));
}

export function getAllVenues() {
  return VENUES;
}

export function getGames(extraGames: Game[] = []) {
  return [...extraGames, ...GAMES];
}

export function getGamesByExperience(experienceId: string, extraGames: Game[] = []) {
  return getGames(extraGames).filter((game) => game.experienceId === experienceId && game.status !== "draft");
}

export function getGameById(id: string, extraGames: Game[] = []) {
  return getGames(extraGames).find((game) => game.id === id);
}

export function getMissionsByExperience(experienceId: string) {
  return MISSIONS.filter((mission) => mission.experienceId === experienceId);
}

export function getRewardsByExperience(experienceId: string) {
  return REWARDS.filter((reward) => reward.experienceId === experienceId);
}

export function getBadges() {
  return BADGES;
}

export function getAllTransactions(localTransactions: PointsTransaction[]) {
  return [...SEED_TRANSACTIONS, ...localTransactions];
}

export const experienceRepository = {
  getAll: getExperiences,
  getActive: getActiveExperiences,
  getById: getExperienceById,
};

export const venueRepository = {
  getAll: getAllVenues,
  getByIds: getVenuesByIds,
};

export const gameRepository = {
  getAll: getGames,
  getByExperience: getGamesByExperience,
  getById: getGameById,
};

export const missionRepository = {
  getByExperience: getMissionsByExperience,
};

export const rewardRepository = {
  getByExperience: getRewardsByExperience,
};

export const pointsRepository = {
  getAll: getAllTransactions,
};

export const leaderboardRepository = {
  getUsers,
};

export const profileRepository = {
  getCurrentUser,
  getBadges,
};
