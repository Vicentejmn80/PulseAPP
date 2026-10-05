import { callRpc, readSessionToken } from "@/services/accountApi";

export type AnalyticsEvent =
  | "registration_completed"
  | "prediction_created"
  | "prediction_edited"
  | "prediction_locked"
  | "prediction_scored"
  | "trivia_started"
  | "trivia_completed"
  | "trivia_answered"
  | "league_created"
  | "league_joined"
  | "venue_viewed"
  | "prize_viewed"
  | "prize_won"
  | "prize_redeemed"
  | "qr_scanned"
  | "challenge_viewed"
  | "challenge_selected"
  | "challenge_deselected"
  | "challenge_submitted"
  | "challenge_correct"
  | "challenge_incorrect"
  | "challenge_bonus_awarded";

export function trackEvent(event: AnalyticsEvent, properties?: Record<string, unknown>) {
  const token = readSessionToken();
  if (!token) return Promise.resolve();
  return callRpc("pulse_analytics_track", {
    p_token: token,
    p_event_name: event,
    p_properties: properties ?? {},
  }).catch(() => undefined);
}

export interface UserStats {
  predictionsMade: number;
  triviaCorrect: number;
  triviaAnswered: number;
  leaguesJoined: number;
  prizesWon: number;
}

export async function myStats(): Promise<UserStats> {
  const result = await callRpc<{ ok?: boolean; error?: string } & Partial<UserStats>>("pulse_my_stats", {
    p_token: readSessionToken(),
  });
  if (!result?.ok) throw new Error(result?.error || "No se pudieron cargar las estadisticas.");
  return {
    predictionsMade: Number(result.predictionsMade ?? 0),
    triviaCorrect: Number(result.triviaCorrect ?? 0),
    triviaAnswered: Number(result.triviaAnswered ?? 0),
    leaguesJoined: Number(result.leaguesJoined ?? 0),
    prizesWon: Number(result.prizesWon ?? 0),
  };
}
