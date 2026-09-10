import { Hono } from "hono";
import { config } from "../../config.js";
import { providerIds } from "../../providers/registry.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function getVersion(): string {
  // Works for both dev (src/routes/v1) and prod (dist/routes/v1) + Docker (/app)
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "../../../../../package.json"), // repo root (dev)
    join(dirname(fileURLToPath(import.meta.url)), "../../../package.json"),      // /app/dist -> /app (Docker prod)
    join(process.cwd(), "package.json"),
    join(process.cwd(), "../package.json"),
    join(process.cwd(), "../../package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch { /* try next */ }
  }
  return "unknown";
}

export const healthRoute = new Hono();

healthRoute.get("/", (c) => {
  return c.json({
    status: "ok",
    version: getVersion(),
    uptime: process.uptime(),
    providers: providerIds.length,
    tiers: config.fallbackTiers,
    timestamp: new Date().toISOString(),
  });
});

healthRoute.get("/ready", (c) => c.json({ ready: true }));
