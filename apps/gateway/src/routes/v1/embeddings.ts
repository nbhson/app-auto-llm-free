import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { providers } from "../../providers/registry.js";
import { getProvidersForRequest, isPublicProvider } from "../../lib/router.js";
import { getNextKeyManaged, markRateLimited, markSuccess } from "../../lib/key-manager.js";
import { isOpen, recordSuccess, recordFailure } from "../../lib/circuit-breaker.js";
import { hasScope } from "../../lib/virtual-keys.js";
import { logger } from "../../middleware/logger.js";

const embeddingsSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.string().optional(),
  dimensions: z.number().optional(),
  user: z.string().optional(),
});

export const embeddingsRoute = new Hono();

embeddingsRoute.post("/", zValidator("json", embeddingsSchema), async (c) => {
  const body = c.req.valid("json");
  const model = body.model || "auto";
  const vk = (c as any).get("vk") as any;

  if (vk && !hasScope(vk, model, undefined)) {
    return c.json({ error: { message: `Key not allowed for model ${model}`, type: "insufficient_scope" } }, 403);
  }

  const pinned = c.req.header("x-router")?.trim();
  let providerOrder: string[];
  if (pinned && providers[pinned]) {
    if (vk && !hasScope(vk, undefined, pinned)) {
      return c.json({ error: { message: `Key not allowed for provider ${pinned}`, type: "insufficient_scope" } }, 403);
    }
    providerOrder = [pinned, ...getProvidersForRequest(model, "tiered").filter((p) => p !== pinned)];
  } else {
    // Prefer embedding-capable providers first
    const embeddingPreferred = ["cohere", "nvidia-nim", "cloudflare-workers-ai", "openrouter", "modelscope"];
    const base = getProvidersForRequest(model, "tiered");
    providerOrder = [...embeddingPreferred.filter((p) => base.includes(p)), ...base.filter((p) => !embeddingPreferred.includes(p))];
    // If model is generic, ensure embedding providers are tried first
    if (model === "auto" || model.includes("embed")) {
      providerOrder = embeddingPreferred.filter((p) => providers[p]).concat(base.filter((p) => !embeddingPreferred.includes(p)));
    }
  }

  const errors: any[] = [];
  const startAll = Date.now();

  for (const pid of providerOrder) {
    const provider = providers[pid];
    if (!provider || !provider.embeddings) continue;
    if (isOpen(pid)) {
      errors.push({ provider: pid, error: "circuit open" });
      continue;
    }
    const key = getNextKeyManaged(pid);
    if (key === null) {
      errors.push({ provider: pid, error: "no key configured" });
      continue;
    }
    if (!key && !isPublicProvider(pid)) {
      errors.push({ provider: pid, error: "missing key" });
      continue;
    }

    try {
      const res = await provider.embeddings(
        { model, input: body.input, encoding_format: body.encoding_format, dimensions: body.dimensions, user: body.user },
        key
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errors.push({ provider: pid, status: res.status, error: text.slice(0, 600) });
        recordFailure(pid);
        if (res.status === 429) {
          const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
          markRateLimited(pid, key, isNaN(retry) ? 60000 : retry);
        }
        continue;
      }
      recordSuccess(pid);
      markSuccess(pid, key);
      const data: any = await res.json().catch(async () => ({ text: await res.text() }));
      // Ensure OpenAI shape
      if (data.data && Array.isArray(data.data)) {
        c.header("X-Provider", pid);
        return c.json(data);
      }
      // Normalize if provider returns different shape
      return c.json({
        object: "list",
        data: Array.isArray(data.data) ? data.data : [{ object: "embedding", index: 0, embedding: data.embedding || [] }],
        model: `${pid}/${model}`,
        usage: data.usage || { prompt_tokens: 0, total_tokens: 0 },
      });
    } catch (e: any) {
      logger.warn({ provider: pid, err: e.message }, "embeddings provider failed");
      errors.push({ provider: pid, error: e.message });
      recordFailure(pid);
      continue;
    }
  }

  logger.warn({ model, errors, latency: Date.now() - startAll }, "all embeddings providers failed");

  // Mock only if explicitly allowed via ALLOW_MOCK
  if (process.env.ALLOW_MOCK === "1" && config.nodeEnv === "development" && errors.length > 0) {
    const anyEmbeddingProvider = providerOrder.some((pid) => providers[pid]?.embeddings);
    if (!anyEmbeddingProvider || errors.length === providerOrder.filter((pid) => providers[pid]?.embeddings).length) {
      return c.json(
        {
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: Array(8).fill(0.01) }],
          model,
          usage: { prompt_tokens: 5, total_tokens: 5 },
          _mock: true,
          _errors: errors,
        },
        200
      );
    }
  }

  return c.json({ error: { message: "All embeddings providers failed", type: "provider_error", provider_errors: errors } }, 502);
});
