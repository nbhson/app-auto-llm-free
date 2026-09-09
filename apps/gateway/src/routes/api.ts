import { Hono } from "hono";
import { providerIds, providerMeta } from "../providers/registry.js";
import { config } from "../config.js";
import { listVirtualKeys, createVirtualKey, deleteVirtualKey } from "../lib/virtual-keys.js";
import { getLogs, getStats, onLog } from "../lib/request-log.js";
import { getAllStates } from "../lib/circuit-breaker.js";
import { readDataJson, resolveDataPath } from "../lib/paths.js";
import { semanticCache } from "../lib/semantic-cache.js";
import { hasRealKey, isPublicProvider } from "../lib/provider-keys.js";
import fs from "node:fs";
import path from "node:path";

function loadProvidersJson() {
  return readDataJson<any[]>("freellms-providers.json", []);
}

export const apiRoute = new Hono();

apiRoute.get("/providers", (c) => {
  const freellms = loadProvidersJson();
  const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
  const rawLimit = parseInt(c.req.query("limit") || c.req.query("per_page") || "25", 10);
  const limit = [25, 50].includes(rawLimit) ? rawLimit : 25;
  const q = (c.req.query("q") || "").toLowerCase();
  let detailed = providerIds.map((id) => {
    const meta = providerMeta[id] || { name: id, tier: "", tier_type: "", caps: [], noCard: true };
    const fre = freellms.find((x: { slug?: string; name?: string; tier?: string; tier_type?: string; caps?: string[]; noCard?: boolean; baseUrl?: string; free_models?: number; total_models?: number }) => x.slug === id);
    const keys = config.providerKeys[id] || [];
    const hasReal = hasRealKey(id);
    return {
      id,
      name: meta.name || fre?.name || id,
      tier: meta.tier || fre?.tier || "",
      tier_type: meta.tier_type || fre?.tier_type || "",
      caps: meta.caps || fre?.caps || [],
      noCard: meta.noCard ?? fre?.noCard ?? true,
      baseUrl: (fre as { baseUrl?: string } | undefined)?.baseUrl || "",
      free_models: fre?.free_models ?? 0,
      total_models: fre?.total_models ?? 0,
      keys: keys.length > 0 ? `${keys.length} keys` : "none",
      hasRealKey: hasReal,
      status: keys.length > 0 || id === "pollinations" ? "ready" : "no-key",
    };
  });
  const hasKeyOnly = c.req.query("hasKey") === "1" || c.req.query("has_key") === "1";
  if (q) detailed = detailed.filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  if (hasKeyOnly) {
    detailed = detailed.filter((p) => hasRealKey(p.id) || isPublicProvider(p.id));
  }
  const total = detailed.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const curPage = Math.min(page, totalPages);
  const offset = (curPage - 1) * limit;
  const paginated = detailed.slice(offset, offset + limit);

  return c.json({
    providers: providerIds,
    count: providerIds.length,
    freellms_count: freellms.length || 30,
    tiers: config.fallbackTiers,
    keysConfigured: Object.fromEntries(
      Object.entries(config.providerKeys).map(([k, v]) => [k, v.length > 0 ? `${v.length} keys` : "none"])
    ),
    defaultModel: config.defaultModel,
    detailed: paginated,
    pagination: { page: curPage, limit, total, total_pages: totalPages, has_next: curPage < totalPages, has_prev: curPage > 1 },
    filters: { q: q || null, hasKey: hasKeyOnly || false },
  });
});

apiRoute.get("/providers/health", async (c) => {
  const { providers } = await import("../providers/registry.js");
  const breakers = getAllStates() as Record<string, any>;
  const results: any[] = [];
  const timeoutMs = 5000;

  await Promise.all(
    providerIds.map(async (id) => {
      const keys = config.providerKeys[id] || [];
      const hasKey = keys.length > 0;
      const isPublic = ["pollinations", "llm7-io", "ollama-cloud", "glhf-chat"].includes(id);
      if (!hasKey && !isPublic) {
        results.push({ id, status: "no-key", keys: 0, latency_ms: 0, breaker: breakers[id]?.state || "closed" });
        return;
      }
      const key = keys[0] || "";
      const provider = (providers as any)[id];
      if (!provider) {
        results.push({ id, status: "unknown", error: "no provider" });
        return;
      }
      const start = Date.now();
      try {
        const ok = await Promise.race([
          provider.health(key),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ]);
        const latency = Date.now() - start;
        results.push({
          id,
          status: ok ? "online" : "offline",
          keys: keys.length,
          latency_ms: latency,
          breaker: breakers[id]?.state || "closed",
          failures: breakers[id]?.failures || 0,
        });
      } catch (e: any) {
        results.push({ id, status: "error", keys: keys.length, latency_ms: Date.now() - start, error: e.message, breaker: breakers[id]?.state || "closed" });
      }
    })
  );

  results.sort((a, b) => a.id.localeCompare(b.id));

  const summary = {
    total: results.length,
    online: results.filter((r) => r.status === "online").length,
    offline: results.filter((r) => r.status === "offline").length,
    no_key: results.filter((r) => r.status === "no-key").length,
    open_breaker: results.filter((r) => r.breaker === "open").length,
  };

  return c.json({
    status: "live",
    generated_at: new Date().toISOString(),
    summary,
    providers: results,
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

apiRoute.get("/verify", (c) => {
  const data = readDataJson<any>("verified-models.json", null as any);
  if (!data) return c.json({ status: "no_data", message: "Run POST /api/verify or wait for 24h scheduler" }, 404);
  return c.json(data);
});

apiRoute.get("/verify/summary", (c) => {
  const data = readDataJson<any>("verified-summary.json", null as any);
  if (!data) return c.json({ status: "no_data" }, 404);
  return c.json(data);
});

apiRoute.post("/verify", async (c) => {
  const { verifyFreeModels, saveVerifyReport } = await import("../jobs/verify-free.js");
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body.dryRun ?? false;
  const report = await verifyFreeModels({ dryRun });
  await saveVerifyReport(report);
  return c.json(report);
});
apiRoute.post("/models/live/sync", async (c) => {
  const { syncLiveModels } = await import("../jobs/sync-live-models.js");
  const body = await c.req.json().catch(() => ({}));
  const freeOnly = body.freeOnly ?? true;
  const result = await syncLiveModels({ freeOnly });
  return c.json({ ...result, generated_at: new Date().toISOString(), free_only: freeOnly });
});
apiRoute.get("/models/live", (c) => {
  const data = readDataJson<any>("live-models.json", null as any);
  if (!data) return c.json({ total: 0, models: [], generated_at: null, note: "Run POST /api/models/live/sync with real keys to generate" });
  return c.json(data);
});

apiRoute.get("/models/health", async (c) => {
  const provider = c.req.query("provider");
  const model = c.req.query("model");
  const limit = Math.min(parseInt(c.req.query("limit") || "10", 10), 50);
  const { probeModel, probeModels } = await import("../jobs/probe-models.js");
  const { readDataJson } = await import("../lib/paths.js");

  if (model) {
    // Single model probe: ?model=nvidia-nim/z-ai/glm-5.2
    const result = await probeModel(model.split("/")[0], model);
    return c.json(result);
  }

  // Bulk probe: provider filter or top models
  const all = readDataJson<any[]>("freellms-models-free.json", []);
  let ids: string[] = all.map((m: any) => `${m.slug}/${m.name}`);
  if (provider) ids = ids.filter((id) => id.startsWith(provider + "/"));
  ids = ids.slice(0, limit);
  if (ids.length === 0) return c.json({ error: "no models found", provider, limit }, 400);
  const results = await probeModels(ids, { concurrency: 3 });
  const summary = {
    total: results.length,
    usable: results.filter((r) => r.status === "usable").length,
    unusable: results.filter((r) => r.status === "unusable").length,
    no_key: results.filter((r) => r.status === "no-key").length,
    error: results.filter((r) => r.status === "error" || r.status === "timeout").length,
  };
  return c.json({ provider: provider || "all", limit, summary, models: results });
});

// Persisted 404/410 health: stored in data/model-health.json so reload keeps strikethrough
// MUST be before /:id route to avoid shadowing
function readModelHealth(): Record<string, any> {
  return readDataJson<Record<string, any>>("model-health.json", {});
}
function writeModelHealth(map: Record<string, any>) {
  const p = resolveDataPath("model-health.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(map, null, 2));
}
apiRoute.get("/models/health/persisted", (c) => {
  const map = readModelHealth();
  const list = Object.entries(map).map(([id, v]: any) => ({ id, ...v }));
  return c.json({ object: "list", total: list.length, data: list });
});
apiRoute.post("/models/health/mark", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const rawIds: unknown = body.ids || (body.id ? [body.id] : []);
  const ids: string[] = (Array.isArray(rawIds) ? rawIds : [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 200))
    .slice(0, 100);
  const status = typeof body.status === "string" ? body.status.slice(0, 32) : "unusable";
  const http_status = Math.min(Math.max(Number(body.http_status) || 404, 100), 599);
  const error = typeof body.error === "string" ? body.error.slice(0, 500) : "model_not_found";
  if (ids.length === 0) return c.json({ error: "ids required" }, 400);
  const map = readModelHealth();
  const now = new Date().toISOString();
  for (const id of ids) {
    // persist usable/200 to override previous 404/410 so reload keeps non-red
    if (status === "usable" || http_status === 200) {
      map[id] = { status: "usable", http_status: 200, error: "", updated_at: now, provider: id.split("/")[0], latency_ms: body.latency_ms || 0 };
    } else if (http_status === 404 || http_status === 410 || /model_not_found|Gone/i.test(error)) {
      map[id] = { status, http_status, error: String(error).slice(0, 500), updated_at: now, provider: id.split("/")[0] };
    }
  }
  writeModelHealth(map);
  return c.json({ saved: ids.length, total: Object.keys(map).length });
});
apiRoute.delete("/models/health/persisted", (c) => {
  const p = resolveDataPath("model-health.json");
  try { fs.unlinkSync(p); } catch { /* ignore */ }
  return c.json({ deleted: true });
});
apiRoute.delete("/models/health/persisted/:id", async (c) => {
  const full = c.req.url.split("/api/models/health/persisted/")[1]?.split("?")[0];
  const id = full ? decodeURIComponent(full) : c.req.param("id");
  const map = readModelHealth();
  if (map[id]) { delete map[id]; writeModelHealth(map); return c.json({ deleted: true, id }); }
  return c.json({ error: "not found" }, 404);
});

apiRoute.get("/models/health/:id", async (c) => {
  const id = c.req.param("id");
  // Hono param stops at /, so we also try to get full path after /models/health/
  const full = c.req.url.split("/api/models/health/")[1]?.split("?")[0];
  const modelId = full ? decodeURIComponent(full) : id;
  const { probeModel } = await import("../jobs/probe-models.js");
  const providerId = modelId.split("/")[0];
  const result = await probeModel(providerId, modelId);
  return c.json(result);
});

apiRoute.get("/keys", (c) => {
  const keys = listVirtualKeys();
  return c.json({ object: "list", data: keys, total: keys.length });
});

apiRoute.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return c.json({ error: { message: "name required", type: "invalid_request" } }, 400);
  const scopesRaw = (body.scopes ?? { models: ["*"], providers: ["*"] }) as {
    models?: unknown;
    providers?: unknown;
  };
  const cleanList = (v: unknown): string[] => {
    if (!Array.isArray(v)) return ["*"];
    return v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 120))
      .slice(0, 50);
  };
  const rpmLimit = Math.min(Math.max(Number(body.rpmLimit ?? body.rpm_limit ?? 60) || 60, 1), 10000);
  const tpdLimit = Math.min(Math.max(Number(body.tpdLimit ?? body.tpd_limit ?? 100000) || 100000, 100), 100_000_000);
  const role = body.role === "admin" ? "admin" : "user";
  const vk = createVirtualKey({
    name,
    scopes: { models: cleanList(scopesRaw.models), providers: cleanList(scopesRaw.providers) },
    rpmLimit,
    tpdLimit,
    role,
  });
  return c.json({ id: vk.id, key: vk.key, name: vk.name, scopes: vk.scopes, rpmLimit: vk.rpmLimit, createdAt: vk.createdAt }, 201);
});

apiRoute.delete("/keys/:id", (c) => {
  const id = c.req.param("id");
  const ok = deleteVirtualKey(id);
  if (!ok) return c.json({ error: { message: "not found", type: "not_found" } }, 404);
  return c.json({ deleted: true, id });
});

apiRoute.get("/logs", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const logs = getLogs(limit, offset);
  return c.json({ object: "list", data: logs, total: logs.length });
});

apiRoute.get("/logs/stream", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`));
      const off = onLog((log) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`));
        } catch { /* ignore */ }
      });
      c.req.raw.signal.addEventListener("abort", () => {
        off();
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});

apiRoute.get("/config", (c) => {
  return c.json({
    SEMANTIC_CACHE_ENABLED: config.semanticCacheEnabled ? 1 : 0,
    SEMANTIC_THRESHOLD: config.semanticCacheThreshold,
    CACHE_TTL_S: config.semanticCacheTtlSec,
    EMBEDDING_MODEL: (config as any).embeddingModels ? (config as any).embeddingModels.join(",") : config.embeddingModel,
    EMBEDDING_FALLBACKS: (config as any).embeddingFallbacks ? (config as any).embeddingFallbacks.join(",") : "",
    SEMANTIC_CACHE_MAX_MEM: (config as any).semanticCacheMaxMemEntries,
    SEMANTIC_CACHE_SCAN_CAP: (config as any).semanticCacheScanCap,
    COMPRESSION_ENABLED: config.compressionEnabled ? 1 : 0,
    COMPRESSION_MAX_TOKENS: (config as any).compressionMaxTokens,
    COST_ROUTING_ENABLED: config.costRoutingEnabled ? 1 : 0,
    COST_WEIGHT: (config as any).costWeight,
    LATENCY_WEIGHT: (config as any).latencyWeight,
    HEADROOM_WEIGHT: (config as any).headroomWeight,
    ANALYTICS_RETENTION_DAYS: config.analyticsRetentionDays,
    _source: ".env",
  });
});

apiRoute.get("/stats", (c) => {
  const freellms = loadProvidersJson();
  const freeModelsArr = readDataJson<any[]>("freellms-models-free.json", []);
  const freeModels = freeModelsArr.length || 316;
  const logStats = getStats();
  return c.json({
    uptime: process.uptime(),
    requests: logStats.total,
    providers: providerIds.length,
    freellms_providers: freellms.length || 30,
    free_models: freeModels,
    total_models: 365,
    tiers: config.fallbackTiers,
    logs: logStats,
    breakers: getAllStates(),
    flags: { semanticCache: config.semanticCacheEnabled, compression: config.compressionEnabled, costRouting: config.costRoutingEnabled },
  });
});

// Vector 2 analytics & cache endpoints
apiRoute.get("/analytics", async (c) => {
  const interval = (c.req.query("interval") as "hour" | "day") || "day";
  const groupBy = (c.req.query("groupBy") as "provider" | "key" | "model") || "provider";
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  try {
    const { getAnalytics, getCostBreakdown, calculateSavings } = await import("../lib/analytics.js");
    const analytics: any = getAnalytics({ interval, groupBy, limit });
    const cost = getCostBreakdown();
    const savings = calculateSavings();
    return c.json({ interval, groupBy, analytics, cost, savings, generated_at: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ interval, groupBy, error: e.message }, 500);
  }
});

apiRoute.get("/cache/stats", async (c) => {
  try {
    const stats = await semanticCache.getStats();
    return c.json({ enabled: config.semanticCacheEnabled, ...stats });
  } catch (e: any) {
    return c.json({ enabled: config.semanticCacheEnabled, error: e.message }, 500);
  }
});

apiRoute.delete("/cache", async (c) => {
  try {
    await semanticCache.clear();
    return c.json({ cleared: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

apiRoute.post("/compression/preview", async (c) => {
  const body: any = await c.req.json().catch(() => ({}));
  const messages = body.messages || [];
  try {
    const { compressMessages } = await import("../lib/compression.js");
    const result = compressMessages(messages, body.maxTokens ? { maxTokens: body.maxTokens } : undefined);
    return c.json({ original: messages.length, compressed: result.messages.length, ratio: result.ratio, savedTokens: result.savedTokens, preview: result.messages.slice(0, 3) });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
