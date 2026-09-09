import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { providers } from "../../providers/registry.js";
import { getProvidersForRequest } from "../../lib/router.js";
import { hasScope } from "../../lib/virtual-keys.js";
import { logger } from "../../middleware/logger.js";
import { tryProviders } from "../../lib/provider-executor.js";
import { estimateTokens } from "../../lib/token-estimator.js";
import { getRequestVk, type UpstreamImages } from "../../lib/types.js";

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

  const startAll = Date.now();

  const result = await tryProviders({
    providerOrder: providerOrder.filter((pid) => providers[pid]?.images),
    // Heuristic: prompt tokens + image output budget (image providers are RPM-bound in practice)
    quotaTokens: estimateTokens(body.prompt) + 256,
    call: ({ providerId: pid, key }) => {
      const fn = providers[pid]?.images;
      if (!fn) throw new Error("provider has no images method");
      return fn(
        { model, prompt: body.prompt, n: body.n, size: body.size, response_format: body.response_format, user: body.user },
        key
      );
    },
  });

  if (result.ok) {
    const { providerId: pid, res } = result;
    {
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
    }
  }

  const errors = result.errors;

  logger.warn({ model, errors, latency: Date.now() - startAll }, "all images providers failed");

  if (process.env.ALLOW_MOCK === "1" && config.nodeEnv === "development" && errors.length > 0) {
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
