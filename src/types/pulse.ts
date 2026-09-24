export type ExperienceStatus = "draft" | "active" | "upcoming" | "ended";
export type VenueStatus = "active" | "inactive";
export type GameType = "trivia" | "prediction" | "quick_challenge";
export type GameStatus = "draft" | "open" | "closed";
export type MissionRequirementType = GameType | "checkin";
export type PointsSourceType = GameType | "checkin" | "mission";
export type RewardStatus = "available" | "retired";
export type ClaimStatus = "claimed" | "redeemed";
export type BadgeTone = "gold" | "fire" | "bronze" | "rose";
export type QuickChallengeVariant = "speed_pick";

export interface Experience {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ExperienceStatus;
  startDate: string;
  endDate: string;
  venueIds: string[];
  gameIds: string[];
  missionIds: string[];
  rewardIds: string[];
  visual: ExperienceVisual;
}

export interface ExperienceVisual {
  gradient: string;
  accent: string;
  icon: "fire" | "trophy" | "bolt";
}

export interface Venue {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  status: VenueStatus;
}

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  points: number;
  timeLimit?: number;
}

export interface TriviaConfig {
  kind: "trivia";
  questions: TriviaQuestion[];
}

export interface PredictionOption {
  id: string;
  label: string;
}

export interface PredictionConfig {
  kind: "prediction";
  question: string;
  options: PredictionOption[];
  openAt: string;
  closeAt: string;
  result?: string;
}

export interface QuickChallengeConfig {
  kind: "quick_challenge";
  variant: QuickChallengeVariant;
  question: string;
  options: string[];
  correctAnswer: number;
  timeLimit: number;
  points: number;
}

export type GameConfiguration = TriviaConfig | PredictionConfig | QuickChallengeConfig;

export interface Game {
  id: string;
  experienceId: string;
  type: GameType;
  title: string;
  description: string;
  points: number;
  status: GameStatus;
  configuration: GameConfiguration;
}

export interface MissionRequirement {
  id: string;
  type: MissionRequirementType;
  count: number;
  gameId?: string;
  venueId?: string;
}

export interface Mission {
  id: string;
  experienceId: string;
  title: string;
  description: string;
  requirements: MissionRequirement[];
  points: number;
  rewardId?: string;
  startDate: string;
  endDate: string;
  venueId?: string;
}

export interface Participation {
  id: string;
  userId: string;
  experienceId: string;
  gameId?: string;
  type: MissionRequirementType;
  createdAt: string;
  metadata?: {
    questionsAnswered?: number;
    correct?: number;
    optionId?: string;
  };
}

export interface PointsTransaction {
  id: string;
  userId: string;
  experienceId?: string;
  sourceType: PointsSourceType;
  sourceId: string;
  points: number;
  createdAt: string;
}

export interface Leaderboard {
  id: string;
  experienceId?: string;
  period: "all_time" | "weekly";
  skill?: string;
}

export interface LeaderboardEntry {
  position: number;
  user: UserProfile;
  points: number;
  isCurrentUser: boolean;
}

export interface Reward {
  id: string;
  experienceId: string;
  name: string;
  description: string;
  pointsRequired: number;
  status: RewardStatus;
}

export interface RewardClaim {
  id: string;
  userId: string;
  rewardId: string;
  code: string;
  status: ClaimStatus;
  createdAt: string;
}

export interface Redemption {
  id: string;
  claimId: string;
  venueId: string;
  validatedBy: string;
  redeemedAt: string;
}

export interface QrCode {
  id: string;
  venueId: string;
  experienceId?: string;
  label: string;
  active: boolean;
}

export interface CheckIn {
  id: string;
  userId: string;
  venueId: string;
  experienceId: string;
  qrId?: string;
  createdAt: string;
  points: number;
}

export interface Badge {
  id: string;
  name: string;
  tone: BadgeTone;
  icon: "trophy" | "fire" | "medal" | "bolt";
  rule: "first_play" | "prediction" | "trivia" | "top_three";
}

export interface UserProfile {
  id: string;
  alias: string;
  handle: string;
  initials: string;
  avatarColor: string;
  phone?: string;
  accessCode?: string;
}

export interface MissionProgress {
  mission: Mission;
  completed: boolean;
  requirementProgress: Array<{
    requirement: MissionRequirement;
    current: number;
    done: boolean;
  }>;
}

export interface LevelProgress {
  level: number;
  currentThreshold: number;
  nextThreshold: number;
  pointsToNext: number;
  ratio: number;
}
