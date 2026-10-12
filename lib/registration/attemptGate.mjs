const LIMITED = new Set(["login-account", "register-account", "start-pin-recovery"]);

export function readGateConfig(env = process.env) {
  return {
    ipMax: numberOr(env.PULSE_IP_MAX, 20),
    ipWindowMs: numberOr(env.PULSE_IP_WINDOW_SEC, 600) * 1000,
    globalFailPerMin: numberOr(env.PULSE_GLOBAL_FAIL_PER_MIN, 40),
    globalReserve: numberOr(env.PULSE_GLOBAL_RESERVE, 25),
    trustedHops: numberOr(env.PULSE_TRUSTED_HOPS, 0),
  };
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function rejectionBody() {
  return {
    ok: false,
    code: "PIN_RATE_LIMITED",
    error: "Demasiados intentos. Espera unos minutos.",
  };
}

export function clientAddress(headers, socketAddress, trustedHops = readGateConfig().trustedHops) {
  const peer = String(socketAddress || "unknown");
  const hops = Number(trustedHops) || 0;
  if (hops <= 0) return peer;
  const raw = headers?.["x-forwarded-for"] || headers?.["X-Forwarded-For"] || "";
  const parts = String(raw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < hops) return peer;
  return parts[parts.length - hops];
}

export function createMemoryStore() {
  const ipHits = new Map();
  const failures = [];
  let reserveUsed = 0;
  let reserveMinute = -1;
  return {
    async ipFailureCount(ip, now, windowMs) {
      const kept = (ipHits.get(ip) || []).filter((stamp) => now - stamp < windowMs);
      if (kept.length) ipHits.set(ip, kept);
      else ipHits.delete(ip);
      return kept.length;
    },
    async addIpFailure(ip, now, windowMs) {
      const kept = (ipHits.get(ip) || []).filter((stamp) => now - stamp < windowMs);
      kept.push(now);
      ipHits.set(ip, kept);
      return kept.length;
    },
    async globalFailureCount(now) {
      while (failures.length && now - failures[0] >= 60_000) failures.shift();
      return failures.length;
    },
    async addGlobalFailure(now) {
      while (failures.length && now - failures[0] >= 60_000) failures.shift();
      failures.push(now);
      return failures.length;
    },
    async takeReserve(now, limit) {
      const minute = Math.floor(now / 60_000);
      if (minute !== reserveMinute) {
        reserveMinute = minute;
        reserveUsed = 0;
      }
      if (reserveUsed >= limit) return false;
      reserveUsed += 1;
      return true;
    },
  };
}

export function createUpstashStore(env = process.env) {
  const base = String(env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || "");
  if (!base || !token) return null;
  async function command(parts) {
    const response = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(parts),
    });
    if (!response.ok) throw new Error("rate store unavailable");
    const payload = await response.json();
    return payload.result;
  }
  return {
    async ipFailureCount(ip, now, windowMs) {
      const key = `pulse:ip:${ip}`;
      const count = Number(await command(["ZCOUNT", key, String(now - windowMs), String(now)]));
      return Number.isFinite(count) ? count : 0;
    },
    async addIpFailure(ip, now, windowMs) {
      const key = `pulse:ip:${ip}`;
      await command(["ZADD", key, String(now), `${now}:${Math.random().toString(16).slice(2)}`]);
      await command(["ZREMRANGEBYSCORE", key, "0", String(now - windowMs)]);
      await command(["EXPIRE", key, String(Math.ceil(windowMs / 1000))]);
      return this.ipFailureCount(ip, now, windowMs);
    },
    async globalFailureCount(now) {
      const key = "pulse:global:fail";
      const count = Number(await command(["ZCOUNT", key, String(now - 60_000), String(now)]));
      return Number.isFinite(count) ? count : 0;
    },
    async addGlobalFailure(now) {
      const key = "pulse:global:fail";
      await command(["ZADD", key, String(now), `${now}:${Math.random().toString(16).slice(2)}`]);
      await command(["ZREMRANGEBYSCORE", key, "0", String(now - 60_000)]);
      await command(["EXPIRE", key, "120"]);
      return this.globalFailureCount(now);
    },
    async takeReserve(now, limit) {
      const minute = Math.floor(now / 60_000);
      const key = `pulse:reserve:${minute}`;
      const used = Number(await command(["INCR", key]));
      await command(["EXPIRE", key, "120"]);
      return Number.isFinite(used) && used <= limit;
    },
  };
}

export function createAttemptGate(config = readGateConfig(), store = createMemoryStore()) {
  let reserveUsed = 0;
  let reserveMinute = -1;

  function rollReserve(now) {
    const minute = Math.floor(now / 60_000);
    if (minute !== reserveMinute) {
      reserveMinute = minute;
      reserveUsed = 0;
    }
  }

  return {
    async check(action, ip, now = Date.now()) {
      if (!LIMITED.has(action)) return { ok: true };
      rollReserve(now);
      const ipCount = await store.ipFailureCount(ip, now, config.ipWindowMs);
      if (ipCount >= config.ipMax) return { ok: false, status: 429, scope: "ip" };
      const globalCount = await store.globalFailureCount(now);
      const saturated = globalCount >= config.globalFailPerMin;
      if (!saturated) return { ok: true, reserved: false };
      if (typeof store.takeReserve === "function") {
        const taken = await store.takeReserve(now, config.globalReserve);
        if (!taken) return { ok: false, status: 429, scope: "global" };
        return { ok: true, reserved: true };
      }
      if (reserveUsed >= config.globalReserve) return { ok: false, status: 429, scope: "global" };
      reserveUsed += 1;
      return { ok: true, reserved: true };
    },
    async noteFailure(ip, now = Date.now()) {
      await store.addIpFailure(ip || "unknown", now, config.ipWindowMs);
      await store.addGlobalFailure(now);
    },
  };
}
