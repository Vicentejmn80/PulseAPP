const STORE_KEY = "pulse-app-v2";

export interface PersistedState {
  transactions: import("@/types/pulse").PointsTransaction[];
  participations: import("@/types/pulse").Participation[];
  completedMissionIds: string[];
  extraGames: import("@/types/pulse").Game[];
  predictionPicks: Record<string, string>;
}

const EMPTY: PersistedState = {
  transactions: [],
  participations: [],
  completedMissionIds: [],
  extraGames: [],
  predictionPicks: {},
};

export function loadPersistedState(): PersistedState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as Partial<PersistedState>;
    return {
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      participations: Array.isArray(raw.participations) ? raw.participations : [],
      completedMissionIds: Array.isArray(raw.completedMissionIds) ? raw.completedMissionIds : [],
      extraGames: Array.isArray(raw.extraGames) ? raw.extraGames : [],
      predictionPicks: raw.predictionPicks && typeof raw.predictionPicks === "object" ? raw.predictionPicks : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export function savePersistedState(state: PersistedState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}
