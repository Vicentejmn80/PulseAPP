export function validatePin(raw: string): { ok: true; pin: string } | { ok: false; code: string; error: string };
export function validateFullName(raw: string): { ok: true; fullName: string } | { ok: false; code: string; error: string };
export function uniqueViolationCode(constraint: string): "PHONE_ALREADY_REGISTERED" | "ALIAS_ALREADY_TAKEN";
export function handlePinAction(action: string, body: Record<string, unknown>): Promise<{ ok: boolean; code?: string; error?: string }>;
export function registerWithPin(body: Record<string, unknown>): Promise<{ ok: boolean }>;
export function loginWithPin(body: Record<string, unknown>): Promise<{ ok: boolean }>;
export function logoutSession(body: Record<string, unknown>): Promise<{ ok: boolean }>;
