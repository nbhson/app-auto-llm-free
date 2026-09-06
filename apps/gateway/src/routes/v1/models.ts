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
        verified: m.verified,
        no_card: m.nocard,
        capabilities: m.modality,
        limit: m.limit,
        created: 1715433600,
      }));
    }
  } catch {}
  return [];
}

const freellmsModels = loadFreellmsModels();

// GET /v1/models and /v1/models/:id
modelsRoute.get("/", async (c) => {
  const providerFilter = c.req.query("provider");
  const freeOnly = c.req.query("free") !== "0"; // default free only, ?free=0 to show all
  const all: any[] = [];

  if (freellmsModels.length > 0) {
    // Use freellms dataset (316 free)
    for (const m of freellmsModels) {
      if (providerFilter && m.owned_by !== providerFilter) continue;
      all.push(m);
    }
    // Add aliases auto/gpt-4 for compat
    if (!providerFilter || providerFilter === "gateway") {
      all.unshift(
        { id: "auto", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600, capabilities: ["text"] },
        { id: "gpt-4", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600 },
        { id: "gpt-3.5", object: "model", owned_by: "gateway", provider: "gateway", context_length: 8192, created: 1715433600 },
      );
    }
  } else {
    // Static fallbacks for P1 without data file
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

  return c.json({ object: "list", data: all, total: all.length, free: freellmsModels.length });
});

modelsRoute.get("/:id", (c) => {
  const id = c.req.param("id");
  const found = freellmsModels.find((m) => m.id === id);
  if (found) return c.json(found);
  return c.json({ id, object: "model", owned_by: id.split("/")[0] || "gateway", created: 1715433600 });
});
