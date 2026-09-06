import { Hono } from "hono";
import { providerIds, providerMeta } from "../providers/registry.js";
import { config } from "../config.js";
import fs from "node:fs";
import path from "node:path";

function loadProvidersJson() {
  try {
    const p = path.resolve("data/freellms-providers.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return [];
}

export const apiRoute = new Hono();

apiRoute.get("/providers", (c) => {
  const freellms = loadProvidersJson();
  const detailed = providerIds.map((id) => {
    const meta = providerMeta[id] || { name: id, tier: "", tier_type: "", caps: [], noCard: true };
    const fre = freellms.find((x: any) => x.slug === id);
    const keys = config.providerKeys[id] || [];
    return {
      id,
      name: meta.name || fre?.name || id,
      tier: meta.tier || fre?.tier || "",
      tier_type: meta.tier_type || fre?.tier_type || "",
      caps: meta.caps || fre?.caps || [],
      noCard: meta.noCard ?? fre?.noCard ?? true,
      baseUrl: (fre as any)?.baseUrl || "",
      free_models: fre?.free_models ?? 0,
      total_models: fre?.total_models ?? 0,
      keys: keys.length > 0 ? `${keys.length} keys` : "none",
      status: keys.length > 0 || id === "pollinations" ? "ready" : "no-key",
    };
  });

  return c.json({
    providers: providerIds,
    count: providerIds.length,
    freellms_count: freellms.length || 30,
    tiers: config.fallbackTiers,
    keysConfigured: Object.fromEntries(
      Object.entries(config.providerKeys).map(([k, v]) => [k, v.length > 0 ? `${v.length} keys` : "none"])
    ),
    defaultModel: config.defaultModel,
    detailed,
  });
});

apiRoute.get("/providers/health", async (c) => {
  return c.json({
    status: "stub",
    message: "Health check will ping each provider in P3 — now shows registry from freellms scan",
    providers: providerIds.map((id) => {
      const keys = config.providerKeys[id] || [];
      return { id, status: keys.length > 0 || id === "pollinations" ? "ready" : "no-key", keys: keys.length };
    }),
  });
});

apiRoute.get("/stats", (c) => {
  const freellms = loadProvidersJson();
  let freeModels = 0;
  try {
    const p = path.resolve("data/freellms-models-free.json");
    if (fs.existsSync(p)) freeModels = JSON.parse(fs.readFileSync(p, "utf-8")).length;
  } catch {}
  return c.json({
    uptime: process.uptime(),
    requests: 0,
    providers: providerIds.length,
    freellms_providers: freellms.length || 30,
    free_models: freeModels || 316,
    total_models: 365,
    tiers: config.fallbackTiers,
  });
});

apiRoute.get("/models/sync", (c) => {
  return c.json({
    source: "freellms.org",
    last_sync: "2026-09-06",
    models_yaml: "models.yaml (316 free)",
    data_files: ["data/freellms-providers.json", "data/freellms-models-free.json"],
    script: "python scripts/sync-freellms.py",
  });
});

apiRoute.get("/keys", (c) => c.json({ keys: [], _mock: true }));
apiRoute.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ id: `key-${Date.now()}`, key: `fgk-mock-${Date.now()}`, name: body.name || "mock", _mock: true }, 201);
});
