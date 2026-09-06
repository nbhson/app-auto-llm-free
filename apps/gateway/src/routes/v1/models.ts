import { Hono } from "hono";
import { providers } from "../../providers/registry.js";
import fs from "node:fs";
import path from "node:path";

export const modelsRoute = new Hono();

// Load freellms free models if available (316 models)
function loadFreellmsModels(): any[] {
  try {
    const p = path.resolve("data/freellms-models-free.json");
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      const arr = JSON.parse(raw);
      return arr.map((m: any) => ({
        id: `${m.slug}/${m.name}`,
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
      }));
    }
  } catch {}
  return [];
}

function loadVerifiedMap(): Map<string, any> {
  try {
    const p = path.resolve("data/verified-models.json");
    if (!fs.existsSync(p)) return new Map();
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    const map = new Map<string, any>();
    for (const m of data.models || []) map.set(m.id, m);
    return map;
  } catch {
    return new Map();
  }
}

const freellmsModels = loadFreellmsModels();

// GET /v1/models and /v1/models/:id
modelsRoute.get("/", async (c) => {
  const providerFilter = c.req.query("provider");
  const verifiedFilter = c.req.query("verified"); // verified=free | verified=deprecated | verified=unverified
  const freeOnly = c.req.query("free") !== "0";
  const verifiedMap = loadVerifiedMap();

  const all: any[] = [];

  if (freellmsModels.length > 0) {
    for (const m of freellmsModels) {
      if (providerFilter && m.owned_by !== providerFilter) continue;
      // Annotate with live verification if exists
      const v = verifiedMap.get(m.id);
      const annotated = v
        ? { ...m, live_status: v.status, live_free: v.live_free, live_found: v.live_found, last_verified: v.last_verified, verified_error: v.error }
        : { ...m, live_status: "unverified_no_data" as const, last_verified: null };
      // Apply verified filter
      if (verifiedFilter) {
        if (verifiedFilter === "free" && annotated.live_status !== "verified_free") continue;
        if (verifiedFilter === "deprecated" && annotated.live_status !== "deprecated") continue;
        if (verifiedFilter === "unverified" && !["unverified_no_key", "unverified_no_data", "error"].includes(annotated.live_status)) continue;
      }
      all.push(annotated);
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

  const verifiedSummary = (() => {
    try {
      const p = path.resolve("data/verified-summary.json");
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {}
    return null;
  })();

  return c.json({
    object: "list",
    data: all,
    total: all.length,
    free: freellmsModels.length,
    verified: verifiedSummary,
    filters: { provider: providerFilter || null, verified: verifiedFilter || null },
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
