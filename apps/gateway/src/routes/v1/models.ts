import { Hono } from "hono";
import { providers } from "../../providers/registry.js";
import fs from "node:fs";
import { resolveDataPath, readDataJson } from "../../lib/paths.js";
import { config } from "../../config.js";
import { isPublicProvider } from "../../lib/router.js";

export const modelsRoute = new Hono();

// Sanitize freellms name like "google: gemma 4 31b (free)" -> "google/gemma-4-31b:free"
function sanitizeFreellmsName(name: string): string {
  if (!/[\s()]/.test(name)) return name;
  const hasFree = /\(free\)|\:free/i.test(name);
  let s = name.toLowerCase();
  s = s.replace(/\s*:\s*/g, "/").replace(/\s*\/\s*/g, "/");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[()]/g, "");
  s = s.replace(/--+/g, "-").replace(/\/-+/g, "/").replace(/-\//g, "/");
  if (hasFree && !s.includes(":free")) {
    s = s.replace(/-free$/, ":free");
    if (!s.includes(":free")) s += ":free";
  }
  s = s.replace(/\/free:free$/, ":free").replace(/\/:free$/, ":free");
  return s;
}
 // Load freellms free models if available (316 models)
function loadFreellmsModels(): any[] {
  const arr = readDataJson<any[]>("freellms-models-free.json", []);
  if (arr.length === 0) return [];
  return arr.map((m: any) => {
    const sanitized = sanitizeFreellmsName(m.name);
    return {
      id: `${m.slug}/${sanitized}`,
      raw_id: `${m.slug}/${m.name}`,
      object: "model",
      owned_by: m.slug,
      provider: m.slug,
      display_name: m.name,
      context_length: parseInt(m.context) || 8192,
      score: parseInt(m.score) || 0,
      tier: m.tier_type,
      freellms_verified: m.verified,
      no_card: m.nocard,
      capabilities: m.modality,
      limit: m.limit,
      created: 1715433600,
    };
  });
}

function loadVerifiedMap(): Map<string, any> {
  const data = readDataJson<any>("verified-models.json", null);
  if (!data) return new Map();
  const map = new Map<string, any>();
  for (const m of (data as any).models || []) map.set(m.id, m);
  return map;
}
function loadHealthMap(): Map<string, any> {
  const data = readDataJson<Record<string, any>>("model-health.json", {});
  const map = new Map<string, any>();
  for (const [id, v] of Object.entries(data || {})) map.set(id, v);
  return map;
}
function loadLiveModels(): any[] {
  const data = readDataJson<any>("live-models.json", null as any);
  if (!data || !Array.isArray(data.models)) return [];
  return data.models.map((m: any) => ({
    id: m.id,
    raw_id: m.id,
    object: "model",
    owned_by: m.provider || m.id.split("/")[0],
    provider: m.provider || m.id.split("/")[0],
    display_name: m.display_name || m.id.split("/").pop(),
    context_length: m.context_length || 8192,
    score: 50,
    tier: "live",
    freellms_verified: false,
    no_card: true,
    capabilities: ["text"],
    limit: "live",
    created: 1715433600,
    live_status: "live",
  }));
}

const freellmsModels = loadFreellmsModels();

// GET /v1/models and /v1/models/:id
modelsRoute.get("/", async (c) => {
  const providerFilter = c.req.query("provider");
  const verifiedFilter = c.req.query("verified"); // verified=free | verified=deprecated | verified=unverified
  const freeOnly = c.req.query("free") !== "0";
  const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
  const rawLimit = parseInt(c.req.query("limit") || c.req.query("per_page") || "25", 10);
  const limit = [25, 50].includes(rawLimit) ? rawLimit : 25;
  const q = (c.req.query("q") || "").toLowerCase();
  const hasKeyOnly = c.req.query("hasKey") === "1" || c.req.query("has_key") === "1";
  const verifiedMap = loadVerifiedMap();
  const healthMap = loadHealthMap();
  const liveModelsCache = loadLiveModels();

  const all: any[] = [];

  // If hasKeyOnly and we have live cache, use live provider list as source of truth (not freellms)
  if (hasKeyOnly && liveModelsCache.length > 0) {
    for (const m of liveModelsCache) {
      if (providerFilter && m.owned_by !== providerFilter) continue;
      if (q && !m.id.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q) && !(m.owned_by || "").toLowerCase().includes(q)) continue;
      const h = healthMap.get(m.id);
      if (h && (h.http_status === 404 || h.http_status === 410)) continue; // skip persisted 404 even in live
      if (verifiedFilter === "deprecated" && !(h && (h.http_status === 404 || h.http_status === 410))) continue;
      if (verifiedFilter === "free" || verifiedFilter === "unverified") continue; // live already is free verified
      all.push({ ...m, live_status: "live", health: h, persisted_404: false });
    }
    // also add gateway aliases and extraModels if hasKey
    const extraModels = [
      { id: "kilo-code/auto", object: "model", owned_by: "kilo-code", provider: "kilo-code", display_name: "auto", context_length: 262000, score: 70, tier: "quota", live_status: "alias", capabilities: ["text"], limit: "~200 req/hr", created: 1715433600 },
      { id: "openrouter/auto", object: "model", owned_by: "openrouter", provider: "openrouter", display_name: "openrouter/auto", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day", created: 1715433600 },
      { id: "agnes-ai/agnes-2.5-flash", object: "model", owned_by: "agnes-ai", provider: "agnes-ai", display_name: "agnes-2.5-flash", context_length: 256000, score: 82, tier: "permanent", live_status: "alias", capabilities: ["text","vision"], limit: "30 RPM", created: 1715433600 },
    ];
    for (const em of extraModels) {
      if (providerFilter && em.owned_by !== providerFilter) continue;
      const keys = config.providerKeys[em.owned_by] || [];
      const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(em.owned_by);
      if (!hasRealKey) continue;
      const exists = all.some((m) => m.id === em.id);
      if (!exists) all.push(em as any);
    }
    if (!providerFilter || providerFilter === "gateway") {
      all.unshift(
        { id: "auto", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, capabilities: ["text"], live_status: "alias" },
        { id: "gpt-4", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, live_status: "alias" },
        { id: "gpt-3.5", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, live_status: "alias" },
      );
    }
  } else if (freellmsModels.length > 0) {
    for (const m of freellmsModels) {
      if (providerFilter && m.owned_by !== providerFilter) continue;
      if (hasKeyOnly) {
        const keys = config.providerKeys[m.owned_by] || [];
        const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(m.owned_by);
        if (!hasRealKey) continue;
      }
      if (q && !m.id.toLowerCase().includes(q) && !(m.display_name || "").toLowerCase().includes(q) && !(m.owned_by || "").toLowerCase().includes(q)) continue;
      const v = verifiedMap.get(m.id) || verifiedMap.get((m as any).raw_id);
      const h = healthMap.get(m.id) || healthMap.get((m as any).raw_id);
      let live_status: string = v ? v.status : "unverified_no_data";
      let persisted404: any = null;
      if (h && (h.http_status === 404 || h.http_status === 410)) {
        live_status = "deprecated";
        persisted404 = h;
      }
      const annotated = v || h
        ? { ...m, live_status, live_free: v?.live_free ?? false, live_found: v?.live_found ?? false, last_verified: h?.updated_at || v?.last_verified || null, verified_error: h?.error || v?.error, persisted_404: !!persisted404, health: h }
        : { ...m, live_status: "unverified_no_data" as const, last_verified: null };
      if (verifiedFilter) {
        if (verifiedFilter === "free" && annotated.live_status !== "verified_free") continue;
        if (verifiedFilter === "deprecated" && annotated.live_status !== "deprecated") continue;
        if (verifiedFilter === "unverified" && !["unverified_no_key", "unverified_no_data", "error"].includes(annotated.live_status)) continue;
      }
      all.push(annotated);
    }
      // Always include pollinations public fallback (not in freellms)
      const pollinationsModel = {
        id: "pollinations/openai",
        object: "model",
        owned_by: "pollinations",
        provider: "pollinations",
        display_name: "Pollinations OpenAI",
        context_length: 8192,
        score: 50,
        tier: "permanent",
        live_status: "public",
        capabilities: ["text"],
        limit: "no key",
        created: 1715433600,
      };
      if (!providerFilter || providerFilter === "pollinations") {
        if (!verifiedFilter || verifiedFilter === "free") all.push(pollinationsModel);
      }
      // Always include free auto aliases (kilo/openrouter) and newer agnes model not in freellms
      const extraModels = [
        { id: "kilo-code/auto", object: "model", owned_by: "kilo-code", provider: "kilo-code", display_name: "auto", context_length: 262000, score: 70, tier: "quota", live_status: "alias", capabilities: ["text"], limit: "~200 req/hr", created: 1715433600 },
        { id: "openrouter/auto", object: "model", owned_by: "openrouter", provider: "openrouter", display_name: "openrouter/auto", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day", created: 1715433600 },
        { id: "agnes-ai/agnes-2.5-flash", object: "model", owned_by: "agnes-ai", provider: "agnes-ai", display_name: "agnes-2.5-flash", context_length: 256000, score: 82, tier: "permanent", live_status: "alias", capabilities: ["text","vision"], limit: "30 RPM", created: 1715433600 },
      ];
      for (const em of extraModels) {
        if (providerFilter && em.owned_by !== providerFilter) continue;
        if (hasKeyOnly) {
          const keys = config.providerKeys[em.owned_by] || [];
          const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(em.owned_by);
          if (!hasRealKey) continue;
        }
        if (verifiedFilter && verifiedFilter !== "free" && em.live_status !== verifiedFilter) continue;
        const exists = all.some((m) => m.id === em.id);
        if (!exists) all.push(em as any);
      }
      if (!providerFilter || providerFilter === "gateway") {
        all.unshift(
          { id: "auto", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, capabilities: ["text"], live_status: "alias" },
          { id: "gpt-4", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, live_status: "alias" },
          { id: "gpt-3.5", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, live_status: "alias" },
        );
      }
  } else {
    const staticModels = [
      { id: "groq/llama-3.3-70b-versatile", object: "model", owned_by: "groq", context_length: 131072 },
      { id: "cerebras/llama3.1-70b", object: "model", owned_by: "cerebras", context_length: 8192 },
      { id: "gemini/gemini-2.0-flash", object: "model", owned_by: "gemini", context_length: 1000000 },
      { id: "nvidia-nim/z-ai-glm-5.2", object: "model", owned_by: "nvidia-nim", context_length: 1048576 },
      { id: "pollinations/openai", object: "model", owned_by: "pollinations", context_length: 8192 },
      { id: "auto", object: "model", owned_by: "gateway", context_length: 8192 },
      { id: "gpt-4", object: "model", owned_by: "gateway", context_length: 8192 },
    ];
    for (const m of staticModels) {
      if (!providerFilter || m.owned_by === providerFilter) all.push({ ...m, created: 1715433600 });
    }
  }

  const verifiedSummary = readDataJson<any>("verified-summary.json", null);

  // Pagination: limit 25/50 LOV, page 1-indexed
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const curPage = Math.min(page, totalPages);
  const offset = (curPage - 1) * limit;
  const paginated = all.slice(offset, offset + limit);
  if (q && all.length === 0 && total === 0) {
    // q already filtered above
  }

  return c.json({
    object: "list",
    data: paginated,
    total,
    free: freellmsModels.length,
    verified: verifiedSummary,
    pagination: { page: curPage, limit, total, total_pages: totalPages, has_next: curPage < totalPages, has_prev: curPage > 1 },
    filters: { provider: providerFilter || null, verified: verifiedFilter || null, q: q || null, hasKey: hasKeyOnly || false },
  });
});

modelsRoute.get("/:id", (c) => {
  const id = c.req.param("id");
  const verifiedMap = loadVerifiedMap();
  const found = freellmsModels.find((m) => m.id === id);
  if (found) {
    const v = verifiedMap.get(id);
    return c.json(v ? { ...found, live_status: v.status, last_verified: v.last_verified, error: v.error } : found);
  }
  return c.json({ id, object: "model", owned_by: id.split("/")[0] || "gateway", created: 1715433600 });
});
