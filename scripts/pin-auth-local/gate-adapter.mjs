import { createAttemptGate, createMemoryStore } from "../../lib/registration/attemptGate.mjs";
import { authorizeAdminCall } from "../../lib/registration/adminGate.mjs";
import { registrationEnabled, registerWithPin } from "../../lib/registration/pinAuth.mjs";

const calls = [];
const store = {
  async ipFailureCount() {
    calls.push("read-ip");
    return 0;
  },
  async addIpFailure(ip) {
    calls.push(`add-ip:${ip}`);
    return 1;
  },
  async globalFailureCount() {
    calls.push("read-global");
    return 0;
  },
  async addGlobalFailure() {
    calls.push("add-global");
    return 1;
  },
};

const gate = createAttemptGate({ ipMax: 20, ipWindowMs: 600000, globalFailPerMin: 40, globalReserve: 25 }, store);
const allowed = await gate.check("login-account", "10.0.0.1", 1_000);
await gate.noteFailure("10.0.0.1", 1_000);
const memory = createMemoryStore();
const memoryGate = createAttemptGate({ ipMax: 2, ipWindowMs: 600000, globalFailPerMin: 100, globalReserve: 25 }, memory);
await memoryGate.check("login-account", "10.0.0.8", 2_000);
await memoryGate.noteFailure("10.0.0.8", 2_000);
await memoryGate.noteFailure("10.0.0.8", 2_001);
const third = await memoryGate.check("login-account", "10.0.0.8", 2_002);
const other = await memoryGate.check("login-account", "10.0.0.9", 2_002);

const off = authorizeAdminCall({ fn: "pulse_admin_create_match", args: { p_admin_key: "0123456789abcdef0123456789abcdef" } }, {});
const on = authorizeAdminCall(
  { fn: "pulse_admin_create_match", args: { p_admin_key: "0123456789abcdef0123456789abcdef" } },
  { PULSE_ADMIN_ENABLED: "true", PULSE_ADMIN_SECRET: "0123456789abcdef0123456789abcdef" },
);
const shortKey = authorizeAdminCall(
  { fn: "pulse_admin_create_match", args: { p_admin_key: "short-secret-value" } },
  { PULSE_ADMIN_ENABLED: "true", PULSE_ADMIN_SECRET: "short-secret-value" },
);

process.env.PULSE_REGISTRATION_ENABLED = "false";
const paused = await registerWithPin({ phone: "+580000000123", fullName: "Ana Local", alias: "ana_local", pin: "135790" });
delete process.env.PULSE_REGISTRATION_ENABLED;

const report = {
  adapterSawSuccessWithoutAdd: allowed.ok === true && calls[0] === "read-ip" && calls.includes("add-ip:10.0.0.1"),
  memoryBlocksThirdFailure: third.ok === false && third.scope === "ip" && other.ok === true,
  adminOff: off.code === "ADMIN_DISABLED",
  adminOn: on.ok === true,
  adminShort: shortKey.code === "ADMIN_DENIED",
  registrationPaused: paused.code === "REGISTRATION_PAUSED" && registrationEnabled({ PULSE_REGISTRATION_ENABLED: "true" }) === true,
};
console.log(JSON.stringify(report));
if (!Object.values(report).every(Boolean)) process.exit(1);
