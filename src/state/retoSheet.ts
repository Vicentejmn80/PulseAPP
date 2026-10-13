export interface RetoSheetRequest {
  id: number;
  matchId: string;
  triviaLevel: string;
  alias: string;
  stake: number;
  message: string;
}

let current: RetoSheetRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function openRetoSheet(partial: Partial<Omit<RetoSheetRequest, "id">> = {}) {
  current = {
    id: Date.now(),
    matchId: partial.matchId ?? "",
    triviaLevel: partial.triviaLevel ?? "",
    alias: partial.alias ?? "",
    stake: partial.stake ?? 0,
    message: partial.message ?? "",
  };
  emit();
}

export function startRetoFlow(partial: Partial<Omit<RetoSheetRequest, "id">> = {}) {
  try {
    window.dispatchEvent(new CustomEvent("rusher-reto-open", { detail: partial }));
  } catch {
    // fallback: abrir directo si el navegador bloquea CustomEvent
    openRetoSheet(partial);
  }
}

export function closeRetoSheet() {
  current = null;
  emit();
}

export function subscribeRetoSheet(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readRetoSheet() {
  return current;
}
