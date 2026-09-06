import { Hono } from "hono";
import { providers } from "../../providers/registry.js";

export const modelsRoute = new Hono();

// GET /v1/models and /v1/models/:id
modelsRoute.get("/", async (c) => {
  const providerFilter = c.req.query("provider");
  const all: any[] = [];

  // Static fallbacks for P1 (real fetch in P2 sync)
  const staticModels = [
    { id: "groq/llama-3.3-70b-versatile", object: "model", owned_by: "groq", context_length: 131072 },
    { id: "groq/llama-3.1-8b-instant", object: "model", owned_by: "groq", context_length: 131072 },
    { id: "cerebras/llama3.1-70b", object: "model", owned_by: "cerebras", context_length: 8192 },
    { id: "gemini/gemini-2.0-flash", object: "model", owned_by: "gemini", context_length: 1000000 },
    { id: "gemini/gemini-1.5-flash", object: "model", owned_by: "gemini", context_length: 1000000 },
    { id: "pollinations/openai", object: "model", owned_by: "pollinations", context_length: 8192 },
    { id: "together/meta-llama/Llama-3.3-70B-Instruct-Turbo", object: "model", owned_by: "together", context_length: 8192 },
    { id: "mistral/mistral-small-latest", object: "model", owned_by: "mistral", context_length: 32000 },
    { id: "huggingface/meta-llama/Llama-3.2-3B-Instruct", object: "model", owned_by: "huggingface", context_length: 8192 },
    { id: "auto", object: "model", owned_by: "gateway", context_length: 8192 },
    { id: "gpt-4", object: "model", owned_by: "gateway", context_length: 8192 },
  ];

  for (const m of staticModels) {
    if (!providerFilter || m.owned_by === providerFilter) all.push({ ...m, created: 1715433600 });
  }

  return c.json({ object: "list", data: all });
});

modelsRoute.get("/:id", (c) => {
  const id = c.req.param("id");
  // support slash in id via query? Hono param stops at /, so we also check full path fallback
  return c.json({ id, object: "model", owned_by: id.split("/")[0] || "gateway", created: 1715433600 });
});
