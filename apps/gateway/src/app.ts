import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { config } from "./config.js";
import { requestLogger } from "./middleware/logger.js";
import { healthRoute } from "./routes/v1/health.js";
import { modelsRoute } from "./routes/v1/models.js";
import { chatRoute } from "./routes/v1/chat.js";
import { embeddingsRoute } from "./routes/v1/embeddings.js";
import { apiRoute } from "./routes/api.js";
import { extractBearer, isValidVirtualKey } from "./lib/auth.js";

export function createApp() {
  const app = new Hono();

  app.use("*", cors({ origin: config.corsOrigin, allowHeaders: ["Authorization", "Content-Type", "x-router", "x-router-tier", "x-request-id"] }));
  app.use("*", bodyLimit({ maxSize: 10 * 1024 * 1024 }));
  app.use("*", requestLogger);

  // Public
  app.get("/", (c) => c.json({ name: "app-auto-llm-free", version: "0.1.0", docs: "/docs", health: "/v1/health", models: "/v1/models" }));
  app.route("/v1/health", healthRoute);
  app.get("/docs", (c) => c.html(`<!doctype html><html><head><title>Gateway Docs</title></head><body><h1>Gateway Docs</h1><p>See <a href="/README.md">README</a> and docs/API.md</p><pre>GET /v1/models\nPOST /v1/chat/completions\nPOST /v1/embeddings\nGET /v1/health</pre></body></html>`));

  // Auth middleware for /v1/* (except health)
  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/health" || c.req.path === "/v1/health/ready") return next();
    const key = extractBearer(c as any);
    if (!key || !isValidVirtualKey(key)) {
      return c.json({ error: { message: "Invalid API key", type: "invalid_api_key", code: 401 } }, 401);
    }
    return next();
  });

  app.route("/v1/models", modelsRoute);
  app.route("/v1/chat", chatRoute);
  app.route("/v1/embeddings", embeddingsRoute);

  // Legacy compat: /v1/chat/completions is at /v1/chat/completions via chatRoute
  // Also support /v1/completions stub
  app.post("/v1/completions", async (c) => {
    return c.json({ error: { message: "Use /v1/chat/completions", type: "invalid_request" } }, 400);
  });

  // Admin /api/* — require master key
  app.use("/api/*", async (c, next) => {
    const key = extractBearer(c as any);
    // allow health without auth in dev
    if (c.req.path === "/api/providers" && config.nodeEnv === "development") return next();
    if (!key || !isValidVirtualKey(key)) return c.json({ error: { message: "Unauthorized", type: "invalid_api_key" } }, 401);
    return next();
  });
  app.route("/api", apiRoute);

  // 404
  app.notFound((c) => c.json({ error: { message: `Not found: ${c.req.path}`, type: "not_found" } }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: { message: err.message || "Internal error", type: "internal_error" } }, 500);
  });

  return app;
}
