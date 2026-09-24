import type { LeaderboardEntry, PointsTransaction, UserProfile } from "@/types/pulse";

export function totalPointsForUser(transactions: PointsTransaction[], userId: string, experienceId?: string) {
  return transactions
    .filter((tx) => tx.userId === userId && (!experienceId || tx.experienceId === experienceId))
    .reduce((sum, tx) => sum + tx.points, 0);
}

export function filterTransactions(transactions: PointsTransaction[], since?: string, experienceId?: string) {
  return transactions.filter((tx) => {
    if (experienceId && tx.experienceId !== experienceId) return false;
    if (since && tx.createdAt < since) return false;
    return true;
  });
}

export function buildLeaderboard(input: {
  users: UserProfile[];
  transactions: PointsTransaction[];
  currentUserId: string;
  experienceId?: string;
  since?: string;
}): LeaderboardEntry[] {
  const scoped = filterTransactions(input.transactions, input.since, input.experienceId);
  const userIds = new Set(scoped.map((tx) => tx.userId));
  userIds.add(input.currentUserId);

  const ranked = [...userIds]
    .map((userId) => {
      const user = input.users.find((item) => item.id === userId);
      if (!user) return null;
      return {
        user,
        points: scoped.filter((tx) => tx.userId === userId).reduce((sum, tx) => sum + tx.points, 0),
        isCurrentUser: userId === input.currentUserId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.points - a.points || a.user.alias.localeCompare(b.user.alias));

  return ranked.map((row, index) => ({
    position: index + 1,
    ...row,
  }));
}

export function pointsToNextPosition(entries: LeaderboardEntry[], currentUserId: string) {
  const index = entries.findIndex((entry) => entry.user.id === currentUserId);
  if (index <= 0) return null;
  const current = entries[index];
  const above = entries[index - 1];
  return Math.max(1, above.points - current.points + 1);
}

export function positionsUntilTarget(entries: LeaderboardEntry[], currentUserId: string, targetPosition = 1) {
  const current = entries.find((entry) => entry.user.id === currentUserId);
  if (!current || current.position <= targetPosition) return null;
  const target = entries.find((entry) => entry.position === targetPosition);
  if (!target) return null;
  return {
    positions: current.position - targetPosition,
    points: Math.max(1, target.points - current.points + 1),
  };
}
