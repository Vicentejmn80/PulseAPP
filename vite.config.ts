import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { authorizeAdminCall } from "./lib/registration/adminGate.mjs";
import { clientAddress, createAttemptGate, createMemoryStore, createUpstashStore, readGateConfig, rejectionBody } from "./lib/registration/attemptGate.mjs";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function pulseApi(): Plugin {
  const gate = createAttemptGate(readGateConfig(), createUpstashStore() || createMemoryStore());
  let lastCapNote = 0;
  return {
    name: "pulse-api",
    configureServer(server) {
      server.middlewares.use("/api/pulse", async (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const response = res as ServerResponse;
        try {
          const raw = await readBody(req);
          const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          const action = String(body.action ?? "");
          const callerIp = clientAddress(req.headers, req.socket?.remoteAddress || "");
          if (action === "admin-call") {
            const verdict = authorizeAdminCall(body);
            if (!verdict.ok) {
              console.info(JSON.stringify({ event: "admin_rejected", code: verdict.code }));
              json(response, 403, { ok: false, code: verdict.code, error: "No autorizado." });
              return;
            }
            console.info(JSON.stringify({ event: "admin_call", fn: String(body.fn ?? "") }));
            json(response, 403, { ok: false, code: "ADMIN_UNAVAILABLE", error: "No autorizado." });
            return;
          }
          const decision = await gate.check(action, callerIp);
          if (!decision.ok) {
            if (decision.scope === "global" && Date.now() - lastCapNote > 1000) {
              lastCapNote = Date.now();
              console.info(JSON.stringify({ event: "pin_global_cap" }));
            }
            json(response, 429, rejectionBody());
            return;
          }
          if (action === "start-pin-recovery" || action === "confirm-pin-recovery") {
            const { confirmPinRecovery, startPinRecovery } = await server.ssrLoadModule("/src/server/pinRecovery.ts");
            const result = action === "start-pin-recovery" ? await startPinRecovery(body) : await confirmPinRecovery(body);
            if (!result.ok) await gate.noteFailure(callerIp);
            json(response, result.ok ? 200 : 400, result);
            return;
          }
          if (action === "register-account" || action === "login-account" || action === "logout-account") {
            const { handlePinAction } = await server.ssrLoadModule("/src/server/pinAuth.ts");
            const result = await handlePinAction(action, body);
            if (!result.ok && (action === "login-account" || action === "register-account")) await gate.noteFailure(callerIp);
            json(response, result.ok ? 200 : 400, result);
            return;
          }
          if (
            action === "auth-config" ||
            action === "direct-enter" ||
            action === "send-otp" ||
            action === "verify-otp" ||
            action === "check-alias" ||
            action === "complete-profile"
          ) {
            const { handleOtpAction } = await server.ssrLoadModule("/src/server/otpAuth.ts");
            const result = await handleOtpAction(action, body);
            json(response, result.ok ? 200 : 400, result);
            return;
          }
          const { handlePulse } = await server.ssrLoadModule("/src/server/engine.ts");
          const result = await handlePulse(body);
          json(response, result.ok ? 200 : 400, result);
        } catch (error) {
          json(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error del servidor" });
        }
      });

      server.middlewares.use("/api/auth", async (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const response = res as ServerResponse;
        const url = req.url ?? "";
        const action = url.includes("complete-profile")
          ? "complete-profile"
          : url.includes("verify-otp")
            ? "verify-otp"
            : url.includes("send-otp")
              ? "send-otp"
              : "";
        if (!action) {
          next();
          return;
        }
        try {
          const raw = await readBody(req);
          const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          const { handleOtpAction } = await server.ssrLoadModule("/src/server/otpAuth.ts");
          const result = await handleOtpAction(action, body);
          json(response, result.ok ? 200 : 400, result);
        } catch (error) {
          json(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error del servidor" });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [
      react(),
      pulseApi(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "rusher-locales-afiliados.png",
          "rusher-logo.svg",
          "icons/rusher-any-180.png",
          "icons/rusher-any-192.png",
          "icons/rusher-any-512.png",
          "icons/rusher-dark-180.png",
          "icons/rusher-maskable-512.png",
        ],
        manifest: {
          name: "Rusher",
          short_name: "Rusher",
          description: "Béisbol Rush LVBP · Rusher",
          theme_color: "#0B0D0F",
          background_color: "#1A1D21",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          lang: "es",
          icons: [
            { src: "icons/rusher-any-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icons/rusher-any-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icons/rusher-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "icons/rusher-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,webp,svg,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
