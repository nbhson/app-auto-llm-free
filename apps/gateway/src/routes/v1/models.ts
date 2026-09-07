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

// Supplement from user's opencode.json (https://freellms.org/?free=1 + custom gateways)
// Ensures models like deepseek/deepseek-v4-flash-free and qwen/qwen3.8-27b-free are displayed even if live sync missed them
const opencodeSupplement: any[] = [
  // agnes-custom -> agnes-ai
  { id: "agnes-ai/agnes-2.5-flash", owned_by: "agnes-ai", provider: "agnes-ai", display_name: "agnes-2.5-flash", context_length: 256000, score: 82, tier: "permanent", live_status: "alias", capabilities: ["text","vision"], limit: "30 RPM" },
  // openrouter-custom -> openrouter
  { id: "openrouter/free", owned_by: "openrouter", provider: "openrouter", display_name: "openrouter/free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day" },
  { id: "z-ai/glm-5.2:free", owned_by: "openrouter", provider: "openrouter", display_name: "z-ai/glm-5.2:free", context_length: 262144, score: 75, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "200 req/day" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", owned_by: "openrouter", provider: "openrouter", display_name: "nvidia/nemotron-3-ultra-550b-a55b:free", context_length: 1000000, score: 74, tier: "permanent", live_status: "alias", capabilities: ["reasoning"], limit: "200 req/day" },
  { id: "minimax/minimax-m3:free", owned_by: "openrouter", provider: "openrouter", display_name: "minimax/minimax-m3:free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day" },
  { id: "inclusionai/ling-3.0-flash-fin:free", owned_by: "openrouter", provider: "openrouter", display_name: "inclusionai/ling-3.0-flash-fin:free", context_length: 262144, score: 68, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day" },
  { id: "minimax/minimax-m2.7:free", owned_by: "openrouter", provider: "openrouter", display_name: "minimax/minimax-m2.7:free", context_length: 262144, score: 68, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day" },
  { id: "nvidia/nemotron-3.5-lightning:free", owned_by: "openrouter", provider: "openrouter", display_name: "nvidia/nemotron-3.5-lightning:free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "200 req/day" },
  { id: "anthropic/claude-fable-5.1", owned_by: "openrouter", provider: "openrouter", display_name: "anthropic/claude-fable-5.1", context_length: 200000, score: 72, tier: "quota", live_status: "alias", capabilities: ["text","reasoning"], limit: "200 req/day" },
  // ollama-custom -> ollama-cloud
  { id: "ollama-cloud/gemma4:31b-cloud", owned_by: "ollama-cloud", provider: "ollama-cloud", display_name: "gemma4:31b-cloud", context_length: 262000, score: 72, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "cloud" },
  { id: "ollama-cloud/gpt-oss:120b", owned_by: "ollama-cloud", provider: "ollama-cloud", display_name: "gpt-oss:120b", context_length: 131072, score: 71, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "cloud" },
  { id: "ollama-cloud/nemotron-3-super:cloud", owned_by: "ollama-cloud", provider: "ollama-cloud", display_name: "nemotron-3-super:cloud", context_length: 262000, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "cloud" },
  // kilo-custom -> kilo-code
  { id: "kilo-code/stepfun/step-3.7-flash:free", owned_by: "kilo-code", provider: "kilo-code", display_name: "stepfun/step-3.7-flash:free", context_length: 262000, score: 76, tier: "quota", live_status: "alias", capabilities: ["text","reasoning"], limit: "200 req/hour" },
  { id: "kilo-code/poolside/laguna-s-2.1:free", owned_by: "kilo-code", provider: "kilo-code", display_name: "poolside/laguna-s-2.1:free", context_length: 262000, score: 68, tier: "quota", live_status: "alias", capabilities: ["text","reasoning"], limit: "200 req/hour" },
  // nvidia-custom -> nvidia-nim
  { id: "nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b", owned_by: "nvidia-nim", provider: "nvidia-nim", display_name: "nvidia/nemotron-3-ultra-550b-a55b", context_length: 1000000, score: 74, tier: "permanent", live_status: "alias", capabilities: ["reasoning"], limit: "40 RPM" },
  { id: "nvidia-nim/deepseek-ai/deepseek-v4-flash-0731", owned_by: "nvidia-nim", provider: "nvidia-nim", display_name: "deepseek-ai/deepseek-v4-flash-0731", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "40 RPM" },
  { id: "nvidia-nim/deepseek-ai/deepseek-v4-pro-0813", owned_by: "nvidia-nim", provider: "nvidia-nim", display_name: "deepseek-ai/deepseek-v4-pro-0813", context_length: 262144, score: 72, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "40 RPM" },
  { id: "nvidia-nim/moonshotai/kimi-k3", owned_by: "nvidia-nim", provider: "nvidia-nim", display_name: "moonshotai/kimi-k3", context_length: 262144, score: 75, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "40 RPM" },
  // orcaRouter-custom -> orcarouter (missing on UI)
  { id: "orcarouter/deepseek/deepseek-v4-flash-free", owned_by: "orcarouter", provider: "orcarouter", display_name: "deepseek/deepseek-v4-flash-free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "free" },
  { id: "deepseek/deepseek-v4-flash-free", owned_by: "orcarouter", provider: "orcarouter", display_name: "deepseek/deepseek-v4-flash-free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "free" },
  { id: "orcarouter/qwen/qwen3.8-27b-free", owned_by: "orcarouter", provider: "orcarouter", display_name: "qwen/qwen3.8-27b-free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "free" },
  { id: "qwen/qwen3.8-27b-free", owned_by: "orcarouter", provider: "orcarouter", display_name: "qwen/qwen3.8-27b-free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "free" },
  // aionlabs-custom -> aion-labs
  { id: "aion-labs/aion-3.0", owned_by: "aion-labs", provider: "aion-labs", display_name: "aion-3.0", context_length: 128000, score: 58, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "15 RPM" },
  // llm7-custom -> llm7-io
  { id: "llm7-io/minimax-m2.7", owned_by: "llm7-io", provider: "llm7-io", display_name: "minimax-m2.7", context_length: 128000, score: 69, tier: "permanent", live_status: "alias", capabilities: ["text","reasoning"], limit: "llm7 free" },
  { id: "llm7-io/gpt-oss", owned_by: "llm7-io", provider: "llm7-io", display_name: "gpt-oss", context_length: 131072, score: 65, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "llm7 free" },
  { id: "llm7-io/gemini-3.1-flash-lite", owned_by: "llm7-io", provider: "llm7-io", display_name: "gemini-3.1-flash-lite", context_length: 1048576, score: 59, tier: "permanent", live_status: "alias", capabilities: ["text","image","video","audio"], limit: "llm7 free" },
  // 9router-custom -> 9router
  { id: "9router/ag/gemini-3.7-flash-high", owned_by: "9router", provider: "9router", display_name: "ag/gemini-3.7-flash-high", context_length: 1048576, score: 75, tier: "custom", live_status: "alias", capabilities: ["text"], limit: "custom" },
  { id: "9router/kc/minimax/minimax-m3:free", owned_by: "9router", provider: "9router", display_name: "kc/minimax/minimax-m3:free", context_length: 262144, score: 88, tier: "custom", live_status: "alias", capabilities: ["text"], limit: "custom" },
  { id: "9router/kr/claude-haiku-4.5", owned_by: "9router", provider: "9router", display_name: "kr/claude-haiku-4.5", context_length: 200000, score: 72, tier: "custom", live_status: "alias", capabilities: ["text","reasoning"], limit: "custom" },
  { id: "ag/gemini-3.7-flash-high", owned_by: "9router", provider: "9router", display_name: "ag/gemini-3.7-flash-high", context_length: 1048576, score: 75, tier: "custom", live_status: "alias", capabilities: ["text"], limit: "custom" },
  { id: "kc/minimax/minimax-m3:free", owned_by: "9router", provider: "9router", display_name: "kc/minimax/minimax-m3:free", context_length: 262144, score: 88, tier: "custom", live_status: "alias", capabilities: ["text"], limit: "custom" },
  { id: "kr/claude-haiku-4.5", owned_by: "9router", provider: "9router", display_name: "kr/claude-haiku-4.5", context_length: 200000, score: 72, tier: "custom", live_status: "alias", capabilities: ["text","reasoning"], limit: "custom" },
  // freeai-custom -> freeai
  { id: "freeai/qwen3-8b", owned_by: "freeai", provider: "freeai", display_name: "qwen3-8b", context_length: 131072, score: 60, tier: "custom", live_status: "alias", capabilities: ["text"], limit: "free" },
  { id: "qwen3-8b", owned_by: "freeai", provider: "freeai", display_name: "qwen3-8b", context_length: 131072, score: 60, tier: "custom", live_status: "alias", capabilities: ["text"], limit: "free" },
  // omniroute-custom -> omniroute
  { id: "omniroute/auto/coding", owned_by: "omniroute", provider: "omniroute", display_name: "auto/coding", context_length: 262144, score: 65, tier: "custom", live_status: "alias", capabilities: ["text","code"], limit: "custom" },
  { id: "auto/coding", owned_by: "omniroute", provider: "omniroute", display_name: "auto/coding", context_length: 262144, score: 65, tier: "custom", live_status: "alias", capabilities: ["text","code"], limit: "custom" },
  // myOpenCodeZen-custom -> opencode
  { id: "opencode/nemotron-3.5-lightning-free", owned_by: "opencode", provider: "opencode", display_name: "nemotron-3.5-lightning-free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "free" },
  { id: "opencode/nemotron-3-ultra-free", owned_by: "opencode", provider: "opencode", display_name: "nemotron-3-ultra-free", context_length: 1000000, score: 74, tier: "permanent", live_status: "alias", capabilities: ["reasoning"], limit: "free" },
  { id: "opencode/mimo-v2.5-free", owned_by: "opencode", provider: "opencode", display_name: "mimo-v2.5-free", context_length: 262144, score: 68, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "free" },
  { id: "opencode/ling-3.0-flash-fin-free", owned_by: "opencode", provider: "opencode", display_name: "ling-3.0-flash-fin-free", context_length: 262144, score: 68, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "free" },
  { id: "nemotron-3.5-lightning-free", owned_by: "opencode", provider: "opencode", display_name: "nemotron-3.5-lightning-free", context_length: 262144, score: 70, tier: "permanent", live_status: "alias", capabilities: ["text"], limit: "free" },
  { id: "nemotron-3-ultra-free", owned_by: "opencode", provider: "opencode", display_name: "nemotron-3-ultra-free", context_length: 1000000, score: 74, tier: "permanent", live_status: "alias", capabilities: ["reasoning"], limit: "free" },
  // cline-custom -> cline
  { id: "cline/deepseek-v4-flash", owned_by: "cline", provider: "cline", display_name: "deepseek-v4-flash", context_length: 262144, score: 70, tier: "custom", live_status: "alias", capabilities: ["text","reasoning"], limit: "free" },
  { id: "cline/glm-5.3-flash", owned_by: "cline", provider: "cline", display_name: "glm-5.3-flash", context_length: 262144, score: 70, tier: "custom", live_status: "alias", capabilities: ["text","reasoning"], limit: "free" },
  { id: "deepseek-v4-flash", owned_by: "cline", provider: "cline", display_name: "deepseek-v4-flash", context_length: 262144, score: 70, tier: "custom", live_status: "alias", capabilities: ["text","reasoning"], limit: "free" },
  { id: "glm-5.3-flash", owned_by: "cline", provider: "cline", display_name: "glm-5.3-flash", context_length: 262144, score: 70, tier: "custom", live_status: "alias", capabilities: ["text","reasoning"], limit: "free" },
  // google-custom -> google-gemini
  { id: "google-gemini/gemini-3.5-flash-lite", owned_by: "google-gemini", provider: "google-gemini", display_name: "gemini-3.5-flash-lite", context_length: 1048576, score: 87, tier: "permanent", live_status: "alias", capabilities: ["text","image","video","audio"], limit: "15 RPM" },
  { id: "google-gemini/gemini-3.1-flash-lite-preview", owned_by: "google-gemini", provider: "google-gemini", display_name: "gemini-3.1-flash-lite-preview", context_length: 1048576, score: 59, tier: "permanent", live_status: "alias", capabilities: ["text","image"], limit: "30 RPM" },
  { id: "google-gemini/gemini-3.7-flash", owned_by: "google-gemini", provider: "google-gemini", display_name: "gemini-3.7-flash", context_length: 1048576, score: 85, tier: "permanent", live_status: "alias", capabilities: ["text","image"], limit: "15 RPM" },
  { id: "google-gemini/gemini-3.6-flash", owned_by: "google-gemini", provider: "google-gemini", display_name: "gemini-3.6-flash", context_length: 1048576, score: 91, tier: "permanent", live_status: "alias", capabilities: ["text","image","video"], limit: "15 RPM" },
].map(m => ({ ...m, object: "model", created: 1715433600 }));

// GET /v1/models and /v1/models/:id
modelsRoute.get("/", async (c) => {
  const providerFilter = c.req.query("provider");
  const verifiedFilter = c.req.query("verified"); // verified=free | verified=deprecated | verified=unverified
  const freeOnly = c.req.query("free") !== "0";
  const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
  const rawLimit = parseInt(c.req.query("limit") || c.req.query("per_page") || "25", 10);
  const limit = [25, 50, 100, 200, 500, 1000].includes(rawLimit) ? rawLimit : 25;
  const rawQ = (c.req.query("q") || "").trim().toLowerCase();
  const qTokens = rawQ ? rawQ.split(/[\s\-_\/:]+/).filter(Boolean) : [];
  const matchesQ = (id: string) => {
    if (!rawQ) return true;
    const hay = id.toLowerCase();
    const normHay = hay.replace(/[^a-z0-9]/g, "");
    return qTokens.every((tok) => {
      const normTok = tok.replace(/[^a-z0-9]/g, "");
      return hay.includes(tok) || normHay.includes(normTok);
    });
  };
  const hasKeyOnly = c.req.query("hasKey") === "1" || c.req.query("has_key") === "1";
  const verifiedMap = loadVerifiedMap();
  const healthMap = loadHealthMap();
  const liveModelsCache = loadLiveModels();

  const all: any[] = [];

  // If hasKeyOnly and we have live cache, use live provider list as source of truth (not freellms)
  if (hasKeyOnly && liveModelsCache.length > 0) {
    for (const m of liveModelsCache) {
      if (providerFilter && m.owned_by !== providerFilter) continue;
      if (!matchesQ(m.id)) continue;
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
      if (!matchesQ(em.id)) continue;
      const keys = config.providerKeys[em.owned_by] || [];
      const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(em.owned_by);
      if (!hasRealKey) continue;
      const exists = all.some((m) => m.id === em.id);
      if (!exists) all.push(em as any);
    }
    for (const em of opencodeSupplement) {
      if (providerFilter && em.owned_by !== providerFilter) continue;
      if (!matchesQ(em.id)) continue;
      const keys = config.providerKeys[em.owned_by] || [];
      const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(em.owned_by);
      if (!hasRealKey) continue;
      const h = healthMap.get(em.id);
      if (h && (h.http_status === 404 || h.http_status === 410)) continue;
      const exists = all.some((m) => m.id === em.id);
      if (!exists) all.push({ ...em, health: h, persisted_404: false });
    }
    if (!providerFilter || providerFilter === "gateway") {
        all.unshift(
          { id: "llm-gateway/auto", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, capabilities: ["text"], live_status: "alias" },
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
      if (!matchesQ(m.id)) continue;
      const v = verifiedMap.get(m.id) || verifiedMap.get((m as any).raw_id);
      const h = healthMap.get(m.id) || healthMap.get((m as any).raw_id);
      let live_status: string = v ? v.status : "unverified_no_data";
      let persisted404: any = null;
      if (h && (h.http_status === 404 || h.http_status === 410)) {
        live_status = "deprecated";
        persisted404 = h;
      } else if (h && (h.http_status === 200 || h.status === "usable")) {
        // Check usable persisted via POST /api/models/health/mark overrides deprecated
        live_status = "verified_free";
        persisted404 = null;
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
        if (!matchesQ(em.id)) continue;
        if (hasKeyOnly) {
          const keys = config.providerKeys[em.owned_by] || [];
          const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(em.owned_by);
          if (!hasRealKey) continue;
        }
        if (verifiedFilter && verifiedFilter !== "free" && em.live_status !== verifiedFilter) continue;
        const exists = all.some((m) => m.id === em.id);
        if (!exists) all.push(em as any);
      }
      for (const em of opencodeSupplement) {
        if (providerFilter && em.owned_by !== providerFilter) continue;
        if (!matchesQ(em.id)) continue;
        if (hasKeyOnly) {
          const keys = config.providerKeys[em.owned_by] || [];
          const hasRealKey = keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me")) || isPublicProvider(em.owned_by);
          if (!hasRealKey) continue;
        }
        const h = healthMap.get(em.id);
        let live_status: string = (em as any).live_status;
        let persisted404: any = null;
        if (h && (h.http_status === 404 || h.http_status === 410)) { live_status = "deprecated"; persisted404 = h; }
        else if (h && (h.http_status === 200 || h.status === "usable")) { live_status = "verified_free"; persisted404 = null; }
        if (verifiedFilter) {
          if (verifiedFilter === "free" && live_status !== "verified_free" && live_status !== "alias" && live_status !== "live") continue;
          if (verifiedFilter === "deprecated" && live_status !== "deprecated") continue;
          if (verifiedFilter === "unverified" && !["unverified_no_key","unverified_no_data","error"].includes(live_status) && live_status !== "alias") continue;
        }
        const exists = all.some((m) => m.id === em.id);
        if (!exists) all.push({ ...em, live_status, persisted_404: !!persisted404, health: h });
      }
      if (!providerFilter || providerFilter === "gateway") {
        all.unshift(
          { id: "llm-gateway/auto", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, capabilities: ["text"], live_status: "alias" },
        );
      }
  } else {
    const staticModels = [
      { id: "groq/llama-3.3-70b-versatile", object: "model", owned_by: "groq", context_length: 131072 },
      { id: "cerebras/llama3.1-70b", object: "model", owned_by: "cerebras", context_length: 8192 },
      { id: "gemini/gemini-2.0-flash", object: "model", owned_by: "gemini", context_length: 1000000 },
      { id: "nvidia-nim/z-ai-glm-5.2", object: "model", owned_by: "nvidia-nim", context_length: 1048576 },
      { id: "pollinations/openai", object: "model", owned_by: "pollinations", context_length: 8192 },
      { id: "llm-gateway/auto", object: "model", owned_by: "gateway", context_length: 8192 },
    ];
    for (const m of staticModels) {
      if (!providerFilter || m.owned_by === providerFilter) all.push({ ...m, created: 1715433600 });
    }
  }

  const verifiedSummary = readDataJson<any>("verified-summary.json", null);

  // Pagination: limit 25/50 LOV, page 1-indexed
  // Deduplicate by id (fix duplicate keys like hugging-face/Qwen/Qwen2.5-VL-72B-Instruct)
  const seen = new Set<string>();
  const deduped = all.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
  const total = deduped.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const curPage = Math.min(page, totalPages);
  const offset = (curPage - 1) * limit;
  const paginated = deduped.slice(offset, offset + limit);
  if (rawQ && all.length === 0 && total === 0) {
    // q already filtered above
  }

  return c.json({
    object: "list",
    data: paginated,
    total,
    free: freellmsModels.length,
    verified: verifiedSummary,
    pagination: { page: curPage, limit, total, total_pages: totalPages, has_next: curPage < totalPages, has_prev: curPage > 1 },
    filters: { provider: providerFilter || null, verified: verifiedFilter || null, q: rawQ || null, hasKey: hasKeyOnly || false },
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
