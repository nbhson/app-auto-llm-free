import { Hono } from "hono";
import { config } from "../../config.js";
import { providerIds } from "../../providers/registry.js";

export const healthRoute = new Hono();

healthRoute.get("/", (c) => {
  return c.json({
    status: "ok",
    version: "0.9.0",
    uptime: process.uptime(),
    providers: providerIds.length,
    tiers: config.fallbackTiers,
    timestamp: new Date().toISOString(),
  });
});

healthRoute.get("/ready", (c) => c.json({ ready: true }));
