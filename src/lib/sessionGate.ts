export type SessionDecision =
  | { status: "ready"; clearToken: false }
  | { status: "guest"; clearToken: boolean };

/** Decide what to do with a stored session token after pulse_load. */
export function decideSession(input: {
  hasToken: boolean;
  networkError?: boolean;
  ok?: boolean;
  hasUser?: boolean;
}): SessionDecision {
  if (!input.hasToken) return { status: "guest", clearToken: false };
  if (input.networkError) return { status: "guest", clearToken: false };
  if (input.ok && input.hasUser) return { status: "ready", clearToken: false };
  return { status: "guest", clearToken: true };
}
