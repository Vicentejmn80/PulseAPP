export type ExperienceStatus = "draft" | "active" | "upcoming" | "ended";
export type VenueStatus = "active" | "inactive";
export type GameType = "trivia" | "prediction" | "quick_challenge";
export type GameStatus = "draft" | "open" | "closed";
export type MissionRequirementType = GameType | "checkin";
export type PointsSourceType = GameType | "checkin" | "mission" | "live_answer" | "bingo" | "pleno" | "streak" | "qr_scan" | "flash";
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
  winners?: number;
  liveCount?: number;
  prizeLabel?: string;
  daysLabel?: string;
  commercialObjective?: CommercialObjective;
  /** Hidden until the player completes enough experience missions. */
  unlock?: {
    missionIds: string[];
    count: number;
  };
}

export type QREffectKind = "points" | "unlock" | "checkin" | "challenge" | "clue" | "reward" | "progress";

export interface QRInteraction {
  id: string;
  experienceId: string;
  code: string;
  title: string;
  venueId?: string;
  hint: string;
  distanceLabel?: string;
  activeUntil?: string;
  secret?: boolean;
  effect: {
    kind: QREffectKind;
    points?: number;
    gameId?: string;
    clue?: string;
    rewardId?: string;
    stepId?: string;
  };
}

export type MissionLayer = "exploration" | "presence" | "collection" | "competition" | "time" | "social" | "discovery" | "chain";

export interface ExperienceMissionStep {
  id: string;
  label: string;
  layer: MissionLayer;
  qrId?: string;
  gameId?: string;
  venueId?: string;
  collectionItemId?: string;
}

export interface ExperienceMission {
  id: string;
  experienceId: string;
  title: string;
  description: string;
  layers: MissionLayer[];
  steps?: ExperienceMissionStep[];
  points: number;
  badgeName: string;
  rewardId?: string;
  hideRewardUntilComplete?: boolean;
  deadlineLabel?: string;
  activityType?: ActivityType;
  venueId?: string;
  requiresMissionIds?: string[];
  unlocksMissionId?: string;
  commercialAction?: CommercialActionType;
  prompt?: string;
  choices?: string[];
  correctChoice?: number;
  wowLine?: string;
}

export interface CollectionItem {
  id: string;
  label: string;
  qrId: string;
}

export interface Collection {
  id: string;
  experienceId: string;
  title: string;
  items: CollectionItem[];
  unlockLabel: string;
}

export interface LivePulseEvent {
  id: string;
  text: string;
  at: string;
}

export interface ExperienceVisual {
  gradient: string;
  accent: string;
  icon: "fire" | "trophy" | "bolt";
}

export type ActivityType =
  | "trivia"
  | "prediction"
  | "quick_challenge"
  | "discovery"
  | "check_in"
  | "hunt"
  | "collection"
  | "timed_challenge"
  | "final_challenge";

export type CommercialObjective =
  | "generate_visits"
  | "new_customer_acquisition"
  | "product_discovery"
  | "repeat_visit"
  | "brand_activation"
  | "event_traffic";

export type CommercialActionType = "visit_venue" | "redeem_reward" | "product_discovery";

export type RewardKind = "instant" | "unlockable" | "final_prize" | "venue_reward" | "experience_reward";

export interface CommercialAction {
  id: string;
  type: CommercialActionType;
  venueId?: string;
  experienceId: string;
  missionId?: string;
  userId?: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface ActivityFeedEvent {
  id: string;
  experienceId: string;
  text: string;
  at: string;
}

export interface Venue {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  status: VenueStatus;
  blurb?: string;
  experienceIds?: string[];
  commercialObjective?: CommercialObjective;
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
  metadata?: {
    winnerPoints?: number;
    closenessPoints?: number;
    total?: number;
    errorTotal?: number;
    matchId?: string;
    homeScore?: number;
    awayScore?: number;
  };
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
  lifetimePoints?: number;
  isCurrentUser: boolean;
}

export interface Reward {
  id: string;
  experienceId: string;
  name: string;
  description: string;
  pointsRequired: number;
  status: RewardStatus;
  kind?: RewardKind;
  venueId?: string;
  unlockMissionId?: string;
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
