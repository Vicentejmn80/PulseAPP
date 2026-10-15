import { readSessionToken } from "@/services/accountApi";
import { classifyAdminFailure, type AdminFailure } from "@/lib/adminConsole";

export class AdminRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "") {
    super(message);
    this.name = "AdminRequestError";
    this.status = status;
    this.code = code;
  }
}

export function asAdminFailure(error: unknown): AdminFailure {
  if (error instanceof AdminRequestError) {
    return classifyAdminFailure({
      status: error.status || undefined,
      code: error.code,
      message: error.message,
      network: error.code === "NETWORK",
    });
  }
  return classifyAdminFailure({ message: error instanceof Error ? error.message : "" });
}

export async function adminCall<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token: readSessionToken(), params }),
    });
  } catch {
    throw new AdminRequestError(0, "No hay conexión con el servidor.", "NETWORK");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) {
    throw new AdminRequestError(response.status, data.error || "No se pudo completar.", data.code || "");
  }
  return data as T;
}

export interface Overview {
  ok: boolean;
  users: number;
  usersToday?: number;
  users7d: number;
  users30d: number;
  sessionsToday?: number;
  sessions24h?: number;
  sessions7d?: number;
  players?: number;
  matchesUpcoming: number;
  matchesLive: number;
  matchesFinished: number;
  matchesAwaiting?: number;
  predictions: number;
  predictionsToday?: number;
  predictionsPending: number;
  pointsDistributed: number;
  venuesActive: number;
  campaignsActive?: number;
  campaignAccounts?: number;
  qrRewards: number;
  campaignRewards: number;
  generatedAt?: string;
  audit: { at: string; action: string; target: string | null; ok: boolean; handle: string }[];
  activity?: { at: string; kind: string; actor: string; entity: string; ok: boolean; detail: string }[];
  signups?: { day: string; count: number }[];
}

export interface AdminUserRow {
  id: string;
  handle: string;
  alias: string;
  fullName?: string;
  phone: string;
  city: string | null;
  createdAt: string;
  lastSessionAt?: string | null;
  prizeEligible: boolean;
  suspendedAt: string | null;
  points: number;
}

export interface AdminMovement {
  id: string;
  userId?: string;
  handle?: string;
  type: string;
  points: number;
  at: string;
  sourceId: string;
  matchId: string | null;
  venueId: string | null;
  campaignId: string | null;
  reason: string | null;
  adminId?: string | null;
}

export interface MatchBoardRow {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  predictions: number;
  processed: number;
  points: number;
}

export interface AllyVenue {
  id: string;
  name: string;
  zone: string;
  city: string;
  active: boolean;
  scans: number;
  qrRewards: number;
}

export interface AllyCampaign {
  id: string;
  venueId: string;
  venue: string;
  name: string;
  code: string;
  points: number;
  active: boolean;
  opens: number;
  rewards: number;
  newAccounts: number;
}
