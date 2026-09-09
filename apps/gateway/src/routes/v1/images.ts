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
import { getRequestVk, errMessage, type ProviderError, type UpstreamImages } from "../../lib/types.js";

const imagesSchema = z.object({
  model: z.string().optional(),
  prompt: z.string().min(1),
  n: z.number().min(1).max(4).optional(),
  size: z.string().optional(),
  response_format: z.string().optional(),
  user: z.string().optional(),
});

export const imagesRoute = new Hono();

imagesRoute.post("/generations", zValidator("json", imagesSchema), async (c) => {
  const body = c.req.valid("json");
  const model = body.model || "agnes-ai/agnes-image-2.1-flash";
  const vk = getRequestVk(c);

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
    const imagePreferred = ["agnes-ai", "cloudflare-workers-ai", "nvidia-nim", "openrouter"];
    const base = getProvidersForRequest(model, "tiered");
    providerOrder = [...imagePreferred.filter((p) => base.includes(p)), ...base.filter((p) => !imagePreferred.includes(p))];
    if (!model || model === "auto") {
      providerOrder = imagePreferred.filter((p) => providers[p]).concat(base.filter((p) => !imagePreferred.includes(p)));
    }
  }

  const errors: ProviderError[] = [];
  const startAll = Date.now();

  for (const pid of providerOrder) {
    const provider = providers[pid];
    if (!provider || !provider.images) continue;
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
      const res = await provider.images(
        { model, prompt: body.prompt, n: body.n, size: body.size, response_format: body.response_format, user: body.user },
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
      const data = (await res.json().catch(async () => ({ text: await res.text() }))) as UpstreamImages;
      if (data.data && Array.isArray(data.data)) {
        c.header("X-Provider", pid);
        return c.json(data);
      }
      // Normalize
      return c.json({
        created: Math.floor(Date.now() / 1000),
        data: data.data || [{ url: data.url || "", b64_json: data.b64_json || "" }],
      });
    } catch (e) {
      logger.warn({ provider: pid, err: errMessage(e) }, "images provider failed");
      errors.push({ provider: pid, error: errMessage(e) });
      recordFailure(pid);
      continue;
    }
  }

  logger.warn({ model, errors, latency: Date.now() - startAll }, "all images providers failed");

  if (config.nodeEnv === "development" && errors.length > 0) {
    return c.json(
      {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: `https://via.placeholder.com/512?text=${encodeURIComponent(body.prompt.slice(0, 30))}`, revised_prompt: body.prompt }],
        _mock: true,
        _errors: errors,
      },
      200
    );
  }

  return c.json({ error: { message: "All images providers failed", type: "provider_error", provider_errors: errors } }, 502);
});
