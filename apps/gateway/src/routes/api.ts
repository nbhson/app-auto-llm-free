import { Hono } from "hono";
import { providerIds } from "../providers/registry.js";
import { config } from "../config.js";

export const apiRoute = new Hono();

apiRoute.get("/providers", (c) => {
  return c.json({
    providers: providerIds,
    tiers: config.fallbackTiers,
    keysConfigured: Object.fromEntries(
      Object.entries(config.providerKeys).map(([k, v]) => [k, v.length > 0 ? `${v.length} keys` : "none"])
    ),
    defaultModel: config.defaultModel,
  });
});

apiRoute.get("/providers/health", async (c) => {
  // P1 stub — real health check in P3
  return c.json({
    status: "stub",
    message: "Health check will ping each provider in P3",
    providers: providerIds.map((id) => ({ id, status: "unknown" })),
  });
});

apiRoute.get("/stats", (c) => {
  return c.json({
    uptime: process.uptime(),
    requests: 0,
    providers: providerIds.length,
    _mock: true,
  });
});

apiRoute.get("/keys", (c) => c.json({ keys: [], _mock: true }));
apiRoute.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ id: `key-${Date.now()}`, key: `fgk-mock-${Date.now()}`, name: body.name || "mock", _mock: true }, 201);
});
