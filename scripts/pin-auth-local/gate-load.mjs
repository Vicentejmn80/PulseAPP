import { spawn } from "node:child_process";
import { createAttemptGate } from "../../lib/registration/attemptGate.mjs";

const psql = process.env.RUSHER_PSQL;
const db = process.env.RUSHER_TEST_DB || "rusher_pin_local";
if (!psql) throw new Error("Falta RUSHER_PSQL");
if (db !== "rusher_pin_local" && db !== "rusher_pin_schema" && db !== "rusher_pin_real") {
  throw new Error("base rechazada");
}

const PIN = "135790";
const WRONG = "246810";
const OWNER = "+580000000880";

function quote(value) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9_@+\-. ]{0,80}$/.test(text)) throw new Error("argumento rechazado");
  return `'${text}'`;
}

function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.slice(-400)));
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[index] * 100) / 100;
}

async function login(phone, pin) {
  const raw = await query(`select public.pulse_account_login(${quote(phone)}, ${quote(pin)})`);
  return JSON.parse(raw);
}

async function burst(gate, label, ipForIndex) {
  let rejected = 0;
  let allowed = 0;
  let noted = false;
  for (let index = 0; index < 500; index += 1) {
    const ip = ipForIndex(index);
    const decision = await gate.check("login-account", ip);
    if (!decision.ok) {
      rejected += 1;
      if (decision.scope === "global" && !noted) {
        noted = true;
        await query("select public.pulse_auth_note('pin_global_cap', 'GLOBAL_FAIL_CAP', null)");
      }
      continue;
    }
    allowed += 1;
    const phone = `+5800006${String(index).padStart(4, "0")}`;
    await login(phone, WRONG);
    await gate.noteFailure(ip);
  }
  return {
    label,
    rejected,
    allowed,
    rejectPct: Math.round((rejected / 500) * 1000) / 10,
    globalNoted: noted,
  };
}

async function ownerDuring(gate) {
  const latencies = [];
  let rejected = 0;
  let errors = 0;
  for (let index = 0; index < 15; index += 1) {
    const decision = await gate.check("login-account", "192.0.2.20");
    if (!decision.ok) {
      rejected += 1;
      continue;
    }
    const started = performance.now();
    const result = await login(OWNER, PIN);
    latencies.push(performance.now() - started);
    if (result.code !== "SESSION_CREATED") errors += 1;
  }
  return {
    attempts: 15,
    rejected,
    errors,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
  };
}

await query(
  `select public.pulse_account_register(${quote(OWNER)}, 'Dueno Local', 'dueno_local', ${quote(PIN)})`,
);

const sameGate = createAttemptGate();
const sameAttack = burst(sameGate, "una IP", () => "203.0.113.10");
const sameOwner = ownerDuring(sameGate);
const [sameIp, ownerSame] = await Promise.all([sameAttack, sameOwner]);

const manyGate = createAttemptGate();
const manyAttack = burst(manyGate, "muchas IP", (index) => `203.0.${Math.floor(index / 256)}.${index % 256}`);
const manyOwner = ownerDuring(manyGate);
const [manyIp, ownerMany] = await Promise.all([manyAttack, manyOwner]);

const caps = await query(
  "select count(*)::int from public.pulse_auth_events where event = 'pin_global_cap' and reason = 'GLOBAL_FAIL_CAP'",
);

await query(`
  delete from public.pulse_sessions
  where user_id in (select id from public.pulse_profiles where phone = ${quote(OWNER)});
  delete from public.pulse_profiles where phone = ${quote(OWNER)};
`);

const wifiGate = createAttemptGate();
let wifiOk = 0;
for (let index = 0; index < 30; index += 1) {
  const phone = `+5800005${String(index).padStart(4, "0")}`;
  await query(
    `select public.pulse_account_register(${quote(phone)}, 'Local Wifi', ${quote(`wifi${index}`)}, ${quote(PIN)})`,
  );
  const decision = await wifiGate.check("login-account", "10.0.0.8");
  if (!decision.ok) continue;
  const result = await login(phone, PIN);
  if (result.code === "SESSION_CREATED") wifiOk += 1;
}
let wifiAttackRejected = 0;
for (let index = 0; index < 30; index += 1) {
  const decision = await wifiGate.check("login-account", "10.0.0.9");
  if (!decision.ok) {
    wifiAttackRejected += 1;
    continue;
  }
  await login(`+5800004${String(index).padStart(4, "0")}`, WRONG);
  await wifiGate.noteFailure("10.0.0.9");
}

const crowdGate = createAttemptGate();
const owners = [];
for (let index = 0; index < 20; index += 1) {
  const phone = `+5800003${String(index).padStart(4, "0")}`;
  await query(
    `select public.pulse_account_register(${quote(phone)}, 'Dueno Grupo', ${quote(`grp${index}`)}, ${quote(PIN)})`,
  );
  owners.push(phone);
}
for (let index = 0; index < 40; index += 1) {
  const ip = `198.51.100.${index}`;
  const decision = await crowdGate.check("login-account", ip);
  if (!decision.ok) continue;
  await login(`+5800002${String(index).padStart(4, "0")}`, WRONG);
  await crowdGate.noteFailure(ip);
}
const crowdLats = [];
let crowdIn = 0;
for (let index = 0; index < 20; index += 1) {
  const decision = await crowdGate.check("login-account", `203.0.113.${index}`);
  if (!decision.ok) continue;
  const started = performance.now();
  const result = await login(owners[index], PIN);
  crowdLats.push(performance.now() - started);
  if (result.code === "SESSION_CREATED") crowdIn += 1;
}

const report = {
  db,
  sameIp,
  ownerSame,
  manyIp,
  ownerMany,
  globalEvents: Number(caps),
  wifiOk,
  wifiAttackRejected,
  crowdIn,
  crowdP50: percentile(crowdLats, 0.5),
  crowdP95: percentile(crowdLats, 0.95),
};
console.log(JSON.stringify(report));
const ownerEntered = ownerSame.errors === 0 && ownerSame.p50 !== null && ownerMany.errors === 0 && ownerMany.p50 !== null && wifiOk === 30 && crowdIn === 20;
const rejectedEnough = sameIp.rejectPct >= 90 && manyIp.rejectPct >= 80;
if (!ownerEntered || !rejectedEnough) process.exit(1);
