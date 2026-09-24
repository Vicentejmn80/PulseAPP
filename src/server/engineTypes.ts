import type { Game, Participation, PointsTransaction, UserProfile } from "@/types/pulse";

export interface CloudProfile extends UserProfile {
  phone: string;
  accessCode: string;
}

export interface CloudFile {
  profiles: CloudProfile[];
  sessions: Array<{ token: string; userId: string }>;
  participations: Participation[];
  transactions: PointsTransaction[];
  completedMissionIds: Record<string, string[]>;
  predictionPicks: Record<string, Record<string, string>>;
  extraGames: Game[];
}
