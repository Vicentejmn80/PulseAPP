import { spawn } from "node:child_process";
import http from "node:http";
import { createFakePinDelivery, confirmPinRecovery, startPinRecovery } from "../../lib/registration/pinRecovery.mjs";
import { handlePinAction, usePinRpc } from "../../lib/registration/pinAuth.mjs";

const psql = process.env.RUSHER_PSQL;
const db = process.env.RUSHER_TEST_DB || "rusher_pin_local";
if (!psql) throw new Error("Falta RUSHER_PSQL");
if (db !== "rusher_pin_local" && db !== "rusher_pin_schema") throw new Error("base rechazada");

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

async function localRpc(fn, args) {
  const allowed = new Set([
    "pulse_account_register",
    "pulse_account_login",
    "pulse_logout",
    "pulse_pin_recovery_start",
    "pulse_pin_commit",
    "pulse_registration_open",
  ]);
  if (!allowed.has(fn)) throw new Error("rpc rechazada");
  const values = Object.values(args).map(quote).join(", ");
  const raw = await query(`select public.${fn}(${values})`);
  return JSON.parse(raw);
}

usePinRpc(localRpc);
const delivery = createFakePinDelivery();
let captured = "";

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/pulse") {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  const action = String(body.action ?? "");
  let status = 200;
  let result;
  if (action === "start-pin-recovery") {
    result = await startPinRecovery(body, {
      rpc: localRpc,
      deliver: async (phone, code) => {
        captured = String(code);
        return delivery.send(phone);
      },
    });
  } else if (action === "confirm-pin-recovery") {
    result = await confirmPinRecovery(body, { rpc: localRpc });
    status = result.ok ? 200 : 400;
  } else if (action === "register-account" || action === "login-account" || action === "logout-account") {
    result = await handlePinAction(action, body);
    status = result.ok ? 200 : 400;
  } else {
    status = 400;
    result = { ok: false, code: "REGISTRATION_ERROR" };
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
});

function post(port, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/api/pulse", method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function summary(raw) {
  const parsed = JSON.parse(raw);
  return {
    ok: parsed.ok,
    code: parsed.code,
    hasOtp: Object.prototype.hasOwnProperty.call(parsed, "otp"),
    hasDeliver: Object.prototype.hasOwnProperty.call(parsed, "deliver"),
    leakedCode: captured !== "" && raw.includes(captured),
  };
}

const port = 55441;
server.listen(port, "127.0.0.1", async () => {
  const phone = "+580000000201";
  const pin = "135790";
  const steps = [];
  try {
    const registered = await post(port, { action: "register-account", phone, fullName: "Http Local", alias: "http_local", pin });
    const loginBody = JSON.parse(registered.body);
    steps.push({ step: "register", status: registered.status, ...summary(registered.body) });
    const logged = await post(port, { action: "login-account", phone, pin });
    steps.push({ step: "login", status: logged.status, ...summary(logged.body) });
    const started = await post(port, { action: "start-pin-recovery", phone });
    steps.push({ step: "recovery-start", status: started.status, ...summary(started.body), sends: delivery.sent.length });
    const confirmed = await post(port, { action: "confirm-pin-recovery", phone, code: captured, pin: "246810" });
    steps.push({ step: "recovery-confirm", status: confirmed.status, ...summary(confirmed.body) });
    const token = loginBody.token;
    const loggedOut = await post(port, { action: "logout-account", token });
    steps.push({ step: "logout", status: loggedOut.status, ...summary(loggedOut.body) });
    const pass =
      steps[0].code === "PROFILE_CREATED" &&
      steps[1].code === "SESSION_CREATED" &&
      steps[2].code === "RECOVERY_STARTED" &&
      steps[2].hasOtp === false &&
      steps[2].hasDeliver === false &&
      steps[2].leakedCode === false &&
      steps[2].sends === 1 &&
      steps[3].code === "PIN_SET" &&
      steps[3].leakedCode === false &&
      steps[4].code === "LOGGED_OUT" &&
      steps.every((step) => step.hasOtp === false && step.hasDeliver === false && step.leakedCode === false);
    process.stdout.write(JSON.stringify({ status: pass ? "PASÓ" : "FALLÓ", steps }, null, 2));
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: "FALLÓ", error: error instanceof Error ? error.name : "error" }));
  } finally {
    try {
      await query("delete from public.pulse_sessions where user_id in (select id from public.pulse_profiles where phone = '+580000000201')");
      await query("delete from public.pulse_profiles where phone = '+580000000201'");
    } catch {
      /* The HTTP result above is the evidence. */
    }
    server.close();
  }
});
