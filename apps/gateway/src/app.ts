import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { config } from "./config.js";
import { requestLogger } from "./middleware/logger.js";
import { virtualKeyRateLimit } from "./middleware/rate-limit.js";
import { healthRoute } from "./routes/v1/health.js";
import { modelsRoute } from "./routes/v1/models.js";
import { chatRoute } from "./routes/v1/chat.js";
import { embeddingsRoute } from "./routes/v1/embeddings.js";
import { imagesRoute } from "./routes/v1/images.js";
import { apiRoute } from "./routes/api.js";
import { extractBearer } from "./lib/auth.js";
import { isValidVirtualKeyLive } from "./lib/virtual-keys.js";

export function createApp() {
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use("*", cors({ origin: config.corsOrigin, allowHeaders: ["Authorization", "Content-Type", "x-router", "x-router-tier", "x-request-id", "X-Session-ID", "X-Parent-Session-ID", "x-session-id", "x-parent-session-id"], maxAge: 86400 }));
  app.use("*", bodyLimit({ maxSize: 10 * 1024 * 1024 }));
  app.use("*", requestLogger);
  app.use("*", virtualKeyRateLimit);

  // Public bootstrap — expose auto-generated MASTER_KEY for first-time UI binding (local self-hosted)
  // Frontend will auto-fetch this if localStorage.masterKey is placeholder, so new users always have a valid key on first start.
  app.get("/api/bootstrap", (c) => {
    // Allow disabling via env in public deployments
    if (process.env.EXPOSE_BOOTSTRAP === "0" || process.env.EXPOSE_BOOTSTRAP === "false") {
      return c.json({ error: { message: "Bootstrap disabled", type: "forbidden" } }, 403);
    }
    return c.json({ masterKey: config.masterKey });
  });
  // Alias for convenience
  app.get("/api/config/master", (c) => {
    if (process.env.EXPOSE_BOOTSTRAP === "0" || process.env.EXPOSE_BOOTSTRAP === "false") {
      return c.json({ error: { message: "Bootstrap disabled", type: "forbidden" } }, 403);
    }
    return c.json({ masterKey: config.masterKey });
  });

  // Public
  app.get("/", (c) => c.json({ name: "app-auto-llm-free", version: "0.5.1", docs: "/docs", health: "/v1/health", models: "/v1/models" }));
  app.route("/v1/health", healthRoute);
  app.get("/docs", (c) => c.html(`<!doctype html><html><head><title>Gateway Docs</title></head><body><h1>Gateway Docs</h1><p>See <a href="/README.md">README</a> and docs/API.md</p><pre>GET /v1/models\nPOST /v1/chat/completions\nPOST /v1/embeddings\nPOST /v1/images/generations\nGET /v1/health</pre></body></html>`));

  // Auth middleware for /v1/* (except health) — uses virtual-keys + master
  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/health" || c.req.path === "/v1/health/ready") return next();
    const key = extractBearer(c as any);
    const vk = key ? isValidVirtualKeyLive(key) : null;
    if (!vk) {
      return c.json({ error: { message: "Invalid API key", type: "invalid_api_key", code: 401 } }, 401);
    }
    // Scope check for chat: if model or provider pinned via x-router, verify scope
    const pinned = c.req.header("x-router");
    const model = c.req.query("model") || "";
    if (vk && !vk.scopes.models.includes("*") && model && !vk.scopes.models.some((m) => model.includes(m))) {
      // For chat POST we check body later; this is query param check for models list
      if (c.req.path.startsWith("/v1/models") && model && !vk.scopes.models.includes("*")) {
        // allow list but filter later
      }
    }
    if (vk && pinned && !vk.scopes.providers.includes("*") && !vk.scopes.providers.includes(pinned)) {
      return c.json({ error: { message: `Key not allowed for provider ${pinned}`, type: "insufficient_scope" } }, 403);
    }
    (c as any).set("vk", vk);
    return next();
  });

  app.route("/v1/models", modelsRoute);
  app.route("/v1/chat", chatRoute);
  app.route("/v1/embeddings", embeddingsRoute);
  app.route("/v1/images", imagesRoute);

  // Legacy compat: /v1/chat/completions is at /v1/chat/completions via chatRoute
  // Also support /v1/completions stub
  app.post("/v1/completions", async (c) => {
    return c.json({ error: { message: "Use /v1/chat/completions", type: "invalid_request" } }, 400);
  });

  // Admin /api/* — require master or admin virtual key
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/bootstrap" || c.req.path === "/api/config/master") return next();
    const key = extractBearer(c as any);
    if (c.req.path === "/api/providers" && config.nodeEnv === "development") return next();
    const vk = key ? isValidVirtualKeyLive(key) : null;
    if (!vk) return c.json({ error: { message: "Unauthorized", type: "invalid_api_key" } }, 401);
    // For /api/keys POST/DELETE require admin
    if ((c.req.path.startsWith("/api/keys") && c.req.method !== "GET") && vk.role !== "admin") {
      return c.json({ error: { message: "Admin required", type: "forbidden" } }, 403);
    }
    (c as any).set("vk", vk);
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
