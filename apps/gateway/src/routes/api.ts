import { Hono } from "hono";
import { providerIds, providerMeta } from "../providers/registry.js";
import { config } from "../config.js";
import { listVirtualKeys, createVirtualKey, deleteVirtualKey } from "../lib/virtual-keys.js";
import { getLogs, getStats, onLog } from "../lib/request-log.js";
import { getAllStates } from "../lib/circuit-breaker.js";
import { readDataJson } from "../lib/paths.js";

function loadProvidersJson() {
  return readDataJson<any[]>("freellms-providers.json", []);
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
  const { providers } = await import("../providers/registry.js");
  const breakers = getAllStates() as Record<string, any>;
  const results: any[] = [];
  const timeoutMs = 5000;

  await Promise.all(
    providerIds.map(async (id) => {
      const keys = config.providerKeys[id] || [];
      const hasKey = keys.length > 0;
      const isPublic = ["pollinations", "llm7-io", "hugging-face", "huggingface", "ollama-cloud", "glhf-chat"].includes(id);
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

apiRoute.get("/keys", (c) => {
  const keys = listVirtualKeys();
  return c.json({ object: "list", data: keys, total: keys.length });
});

apiRoute.post("/keys", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return c.json({ error: { message: "name required", type: "invalid_request" } }, 400);
  const vk = createVirtualKey({
    name: body.name,
    scopes: body.scopes || { models: ["*"], providers: ["*"] },
    rpmLimit: body.rpmLimit || body.rpm_limit || 60,
    tpdLimit: body.tpdLimit || body.tpd_limit || 100000,
    role: body.role || "user",
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
        } catch {}
      });
      c.req.raw.signal.addEventListener("abort", () => {
        off();
        try { controller.close(); } catch {}
      });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
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
  });
});
