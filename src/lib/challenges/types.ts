export const SCORABLE_FACTS = ["home_score", "away_score", "home_team", "away_team"] as const;

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export type RuleOp =
  | "total_gte"
  | "total_lte"
  | "total_eq"
  | "margin_eq"
  | "margin_gte"
  | "margin_lte"
  | "both_gte"
  | "both_lte"
  | "either_gte"
  | "loser_lte"
  | "loser_gte"
  | "winner_gte"
  | "winner_lte"
  | "home_gte"
  | "home_lte"
  | "home_eq"
  | "away_gte"
  | "away_lte"
  | "away_eq"
  | "shutout"
  | "parity"
  | "winner_doubles"
  | "and"
  | "buckets";

export interface RuleBucket {
  id: string;
  label: string;
  min: number;
  max: number | null;
}

export interface ScoringRule {
  op: RuleOp;
  n?: number;
  even?: boolean;
  rules?: ScoringRule[];
  fact?: "total" | "margin" | "winner_runs" | "loser_runs" | "home" | "away";
  buckets?: RuleBucket[];
}

export interface ChallengeOption {
  id: string;
  label: string;
}

export interface ChallengeTemplate {
  code: string;
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  points: 2 | 4 | 6 | 8 | 10;
  answerType: "boolean" | "multiple";
  options: ChallengeOption[];
  scoringRule: ScoringRule;
  requiredFacts: string[];
  active: boolean;
  priority: number;
  cooldownDays: number;
  tags: string[];
}

export interface FinalScore {
  home: number;
  away: number;
}
