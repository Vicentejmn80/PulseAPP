export interface OtpJson {
  ok: boolean;
  code?: string;
  error?: string;
  message?: string;
  phone?: string;
  isNew?: boolean;
  ticket?: string;
  token?: string;
  available?: boolean;
  retryAfter?: number;
  sandbox?: boolean;
  currentUser?: unknown;
  users?: unknown;
  participations?: unknown;
  transactions?: unknown;
  completedMissionIds?: unknown;
  predictionPicks?: unknown;
  extraGames?: unknown;
}

export function normalizePhone(raw: string): string;
export function aliasKey(raw: string): string;
export function validateAlias(raw: string): { ok: true; alias: string; key: string } | { ok: false; code: string; error: string };
export function mapTwilioFailure(status: number, payload?: { code?: number; error_code?: number; message?: string; error_message?: string }): { code: string; error: string };
export function handleOtpAction(action: string, body: Record<string, unknown>): Promise<OtpJson>;
export function sendOtp(body: Record<string, unknown>): Promise<OtpJson>;
export function verifyOtp(body: Record<string, unknown>): Promise<OtpJson>;
export function checkAlias(body: Record<string, unknown>): Promise<OtpJson>;
export function completeOtpProfile(body: Record<string, unknown>): Promise<OtpJson>;
