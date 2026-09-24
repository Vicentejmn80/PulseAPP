import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildLeaderboard, pointsToNextPosition, totalPointsForUser } from "@/lib/leaderboard";
import { getMissionProgress } from "@/lib/missions";
import { getLevelProgress } from "@/lib/progress";
import {
  addGameOnServer,
  completeOnServer,
  loadAccount,
  loginAccount,
  registerAccount,
  writeSessionToken,
  type AccountSnapshot,
} from "@/services/accountApi";
import {
  experienceRepository,
  gameRepository,
  missionRepository,
  profileRepository,
  rewardRepository,
  venueRepository,
} from "@/services/repositories";
import type { Badge, Experience, Game, LeaderboardEntry, MissionProgress, Participation, PointsTransaction, Reward, UserProfile, Venue } from "@/types/pulse";

interface CompleteGameInput {
  game: Game;
  answers?: number[];
  answer?: number;
  optionId?: string;
}

interface PulseContextValue {
  status: "loading" | "guest" | "ready";
  authError: string;
  currentUser: UserProfile;
  notice: string;
  experiences: Experience[];
  featured: Experience;
  games: Game[];
  extraGames: Game[];
  venues: Venue[];
  rewards: Reward[];
  missions: MissionProgress[];
  transactions: PointsTransaction[];
  participations: Participation[];
  totalPoints: number;
  experiencePoints: number;
  level: ReturnType<typeof getLevelProgress>;
  leaderboard: LeaderboardEntry[];
  weeklyLeaderboard: LeaderboardEntry[];
  pointsToClimb: number | null;
  earnedBadges: Badge[];
  predictionPicks: Record<string, string>;
  hasPlayed: (gameId: string) => boolean;
  setNotice: (value: string) => void;
  register: (phone: string, alias: string) => Promise<void>;
  login: (phone: string, accessCode: string) => Promise<void>;
  logout: () => void;
  completeGame: (input: CompleteGameInput) => Promise<number>;
  submitPrediction: (game: Game, optionId: string) => Promise<number>;
  addGame: (game: Game) => void;
}

const PulseContext = createContext<PulseContextValue | null>(null);

function weekAgoIso() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function earnedFrom(rule: Badge["rule"], userId: string, transactions: PointsTransaction[], position: number) {
  if (rule === "first_play") return transactions.some((tx) => tx.userId === userId);
  if (rule === "prediction") return transactions.some((tx) => tx.userId === userId && tx.sourceType === "prediction");
  if (rule === "trivia") return transactions.some((tx) => tx.userId === userId && tx.sourceType === "trivia");
  return position > 0 && position <= 3;
}

export function PulseProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "guest" | "ready">("loading");
  const [notice, setNotice] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let alive = true;
    loadAccount()
      .then((snapshot) => {
        if (!alive) return;
        setAccount(snapshot);
        setStatus(snapshot ? "ready" : "guest");
      })
      .catch(() => {
        if (!alive) return;
        setStatus("guest");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const currentUser = account?.currentUser ?? null;
  const experiences = experienceRepository.getAll();
  const featured = experienceRepository.getActive()[0] ?? experiences[0] ?? null;
  const extraGames = account?.extraGames ?? [];
  const games = featured ? gameRepository.getByExperience(featured.id, extraGames) : [];
  const venues = featured ? venueRepository.getByIds(featured.venueIds) : [];
  const rewards = featured ? rewardRepository.getByExperience(featured.id) : [];
  const transactions = account?.transactions ?? [];
  const participations = account?.participations ?? [];
  const myTransactions = currentUser ? transactions.filter((tx) => tx.userId === currentUser.id) : [];
  const experienceParticipations = featured ? participations.filter((item) => item.experienceId === featured.id) : [];
  const missions = featured
    ? missionRepository.getByExperience(featured.id).map((mission) => getMissionProgress(mission, experienceParticipations))
    : [];
  const totalPoints = currentUser ? totalPointsForUser(transactions, currentUser.id) : 0;
  const experiencePoints = currentUser && featured ? totalPointsForUser(transactions, currentUser.id, featured.id) : 0;
  const level = getLevelProgress(totalPoints);
  const users = account?.users ?? [];
  const leaderboard = currentUser
    ? buildLeaderboard({ users, transactions, currentUserId: currentUser.id, experienceId: featured?.id })
    : [];
  const weeklyLeaderboard = currentUser
    ? buildLeaderboard({
        users,
        transactions,
        currentUserId: currentUser.id,
        experienceId: featured?.id,
        since: weekAgoIso(),
      })
    : [];
  const myEntry = leaderboard.find((entry) => entry.isCurrentUser);
  const pointsToClimb = currentUser ? pointsToNextPosition(leaderboard, currentUser.id) : null;
  const earnedBadges = currentUser
    ? profileRepository.getBadges().filter((badge) => earnedFrom(badge.rule, currentUser.id, myTransactions, myEntry?.position ?? 99))
    : [];

  const value = useMemo<PulseContextValue>(() => {
    function hasPlayed(gameId: string) {
      return participations.some((item) => item.gameId === gameId && item.userId === currentUser?.id);
    }

    async function enter(next: Promise<AccountSnapshot>) {
      setAuthError("");
      try {
        const snapshot = await next;
        setAccount(snapshot);
        setStatus("ready");
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "No se pudo entrar.");
        throw error;
      }
    }

    return {
      status,
      authError,
      currentUser: currentUser as UserProfile,
      notice,
      experiences,
      featured: featured as Experience,
      games,
      extraGames,
      venues,
      rewards,
      missions,
      transactions: myTransactions,
      participations,
      totalPoints,
      experiencePoints,
      level,
      leaderboard,
      weeklyLeaderboard,
      pointsToClimb,
      earnedBadges,
      predictionPicks: account?.predictionPicks ?? {},
      hasPlayed,
      setNotice,
      register: (phone: string, alias: string) => enter(registerAccount(phone, alias)),
      login: (phone: string, accessCode: string) => enter(loginAccount(phone, accessCode)),
      logout: () => {
        writeSessionToken("");
        setAccount(null);
        setStatus("guest");
      },
      async completeGame(input: CompleteGameInput) {
        const result = await completeOnServer({
          gameId: input.game.id,
          answers: input.answers,
          answer: input.answer,
          optionId: input.optionId,
        });
        setAccount(result.snapshot);
        return result.awarded;
      },
      async submitPrediction(game: Game, optionId: string) {
        const result = await completeOnServer({ gameId: game.id, optionId });
        setAccount(result.snapshot);
        return result.awarded;
      },
      addGame(game: Game) {
        void addGameOnServer(game)
          .then(setAccount)
          .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "No se pudo publicar."));
      },
    };
  }, [
    account?.predictionPicks,
    authError,
    currentUser,
    earnedBadges,
    experiencePoints,
    experiences,
    extraGames,
    featured,
    games,
    leaderboard,
    level,
    missions,
    myTransactions,
    notice,
    participations,
    pointsToClimb,
    rewards,
    status,
    totalPoints,
    venues,
    weeklyLeaderboard,
  ]);

  return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}

export function usePulse() {
  const ctx = useContext(PulseContext);
  if (!ctx) throw new Error("usePulse must be used within PulseProvider");
  return ctx;
}
