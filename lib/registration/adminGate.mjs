import { createHash, timingSafeEqual } from "node:crypto";

const ADMIN_FN = /^(pulse_admin_|pulse_reporter_|pulse_trivia_admin_|pulse_cleanup_test$|pulse_seed_test_scenario$|pulse_require_admin$)/;

export function isAdminFunction(fn) {
  return ADMIN_FN.test(String(fn ?? ""));
}

export function adminEnabled(env = process.env) {
  const raw = String(env.PULSE_ADMIN_ENABLED ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function secretsMatch(expected, provided) {
  const left = String(expected ?? "");
  const right = String(provided ?? "");
  if (left.length < 32 || right.length < 32) return false;
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function authorizeAdminCall(body, env = process.env) {
  const fn = String(body?.fn ?? "");
  if (!isAdminFunction(fn)) return { ok: false, code: "ADMIN_DISABLED" };
  if (!adminEnabled(env)) return { ok: false, code: "ADMIN_DISABLED" };
  const provided = body?.args?.p_admin_key;
  if (!secretsMatch(env.PULSE_ADMIN_SECRET, provided)) return { ok: false, code: "ADMIN_DENIED" };
  return { ok: true, fn };
}
