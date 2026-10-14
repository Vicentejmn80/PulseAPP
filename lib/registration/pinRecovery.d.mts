export function createFakePinDelivery(): {
  sent: Array<{ phone: string; at: number }>;
  send: (phone: string, code: string) => Promise<{ ok: boolean }>;
};

export function startPinRecovery(
  body: { phone?: string },
  deps?: { rpc?: (fn: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>; deliver?: (phone: string, code: string) => Promise<unknown> },
): Promise<{ ok: true; code: "RECOVERY_STARTED" }>;

export function confirmPinRecovery(
  body: { phone?: string; code?: string; pin?: string },
  deps?: { rpc?: (fn: string, args: Record<string, unknown>) => Promise<Record<string, unknown>> },
): Promise<{ ok: boolean; code?: string; error?: string; token?: string; currentUser?: unknown }>;
