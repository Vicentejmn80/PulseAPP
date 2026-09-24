import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
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
          const { handlePulse } = await server.ssrLoadModule("/src/server/engine.ts");
          const result = handlePulse(body);
          response.statusCode = result.ok ? 200 : 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Error del servidor" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pulseApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
