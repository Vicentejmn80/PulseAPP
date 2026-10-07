import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
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
          if (action === "register-account" || action === "login-account" || action === "logout-account") {
            const { handlePinAction } = await server.ssrLoadModule("/src/server/pinAuth.ts");
            const result = await handlePinAction(action, body);
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
        includeAssets: ["rusher-mark.png"],
        manifest: {
          name: "Rusher",
          short_name: "Rusher",
          description: "Cualquier lugar puede tener un Rush.",
          theme_color: "#0B0D0F",
          background_color: "#0B0D0F",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          lang: "es",
          icons: [
            {
              src: "rusher-mark.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "rusher-mark.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "rusher-mark.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
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
