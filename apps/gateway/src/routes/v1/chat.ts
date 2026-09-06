import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { getProvidersForRequest, isPublicProvider } from "../../lib/router.js";
import { providers } from "../../providers/registry.js";
import { logger } from "../../middleware/logger.js";
import { getNextKeyManaged, markRateLimited, markSuccess } from "../../lib/key-manager.js";
import { estimateChatTokens } from "../../lib/token-estimator.js";
import { checkQuota, recordUsage } from "../../lib/quota-tracker.js";
import { isOpen, recordSuccess, recordFailure } from "../../lib/circuit-breaker.js";
import { addLog } from "../../lib/request-log.js";
import { hasScope } from "../../lib/virtual-keys.js";
import fs from "node:fs";
import path from "node:path";

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.union([z.string(), z.array(z.any())]),
      tool_call_id: z.string().optional(),
      name: z.string().optional(),
      tool_calls: z.array(z.any()).optional(),
    })
  ),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  n: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  user: z.string().optional(),
});

function loadVerifiedMap(): Map<string, string> {
  try {
    const p = path.resolve("data/verified-models.json");
    if (!fs.existsSync(p)) return new Map();
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    const m = new Map<string, string>();
    for (const row of data.models || []) m.set(row.id, row.status);
    return m;
  } catch {
    return new Map();
  }
}

export const chatRoute = new Hono();

chatRoute.post(
  "/completions",
  zValidator("json", chatSchema),
  async (c) => {
    const body = c.req.valid("json");
    const model = body.model || config.defaultModel;
    const vk = (c as any).get("vk") as any;

    // Scope check for virtual key
    if (vk && !hasScope(vk, model, undefined)) {
      return c.json({ error: { message: `Key not allowed for model ${model}`, type: "insufficient_scope" } }, 403);
    }

    // x-router header to pin provider
    const pinned = c.req.header("x-router")?.trim();
    let providerOrder: string[];
    if (pinned && providers[pinned]) {
      if (vk && !hasScope(vk, undefined, pinned)) {
        return c.json({ error: { message: `Key not allowed for provider ${pinned}`, type: "insufficient_scope" } }, 403);
      }
      providerOrder = [pinned, ...getProvidersForRequest(model, "tiered").filter((p) => p !== pinned)];
      logger.info({ pinned, model }, "x-router pinned");
    } else {
      providerOrder = getProvidersForRequest(model, "tiered");
    }

    // Filter deprecated models if verified data exists
    const verifiedMap = loadVerifiedMap();
    if (model.includes("/") && verifiedMap.get(model) === "deprecated") {
      logger.warn({ model }, "requested model is deprecated, will fallback");
      const prefix = model.split("/")[0];
      providerOrder = providerOrder.filter((p) => p !== prefix);
    }

    const estimated = estimateChatTokens({ messages: body.messages as any, max_tokens: body.max_tokens });
    const startAll = Date.now();
    const errors: any[] = [];

    for (const pid of providerOrder) {
      const provider = providers[pid];
      if (!provider) continue;

      // Circuit breaker
      if (isOpen(pid)) {
        errors.push({ provider: pid, error: "circuit open (cooldown)" });
        continue;
      }

      const key = getNextKeyManaged(pid);
      if (key === null) {
        errors.push({ provider: pid, error: "no key configured (set " + pid.toUpperCase().replace(/-/g, "_") + "_API_KEYS)" });
        continue;
      }
      if (!key && !isPublicProvider(pid)) {
        errors.push({ provider: pid, error: "missing key" });
        continue;
      }

      // Quota pre-check (RPM/TPM)
      const quota = checkQuota(pid, key, estimated.total);
      if (!quota.allowed) {
        errors.push({ provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs });
        if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
        continue;
      }

      // Skip deprecated model for this provider if verified
      const fullId = model.includes("/") ? model : `${pid}/${model}`;
      if (verifiedMap.get(fullId) === "deprecated" || verifiedMap.get(model) === "deprecated") {
        errors.push({ provider: pid, error: "model deprecated per verified-models.json" });
        continue;
      }

      try {
        const res = await provider.chat(
          {
            model,
            messages: body.messages as any,
            temperature: body.temperature,
            max_tokens: body.max_tokens,
            stream: body.stream,
            tools: body.tools,
            tool_choice: body.tool_choice,
            top_p: body.top_p,
            top_k: body.top_k,
            n: body.n,
            stop: body.stop,
            presence_penalty: body.presence_penalty,
            frequency_penalty: body.frequency_penalty,
            user: body.user,
          },
          key
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          errors.push({ provider: pid, status: res.status, error: text.slice(0, 600) });
          recordFailure(pid);
          // 429 -> mark rate limited with Retry-After
          if (res.status === 429) {
            const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
            markRateLimited(pid, key, isNaN(retry) ? 60000 : retry);
          }
          continue;
        }

        // Success: record + log
        recordSuccess(pid);
        markSuccess(pid, key);
        recordUsage(pid, key, estimated.total);
        const latency = Date.now() - startAll;
        const vStatus = verifiedMap.get(fullId) || "unknown";

        if (body.stream) {
          const contentType = res.headers.get("content-type") || "text/event-stream";
          addLog({
            id: `req-${Date.now()}`,
            timestamp: new Date().toISOString(),
            virtualKeyId: vk?.id,
            virtualKeyName: vk?.name,
            provider: pid,
            model,
            promptTokens: estimated.prompt,
            totalTokens: estimated.total,
            latencyMs: latency,
            status: 200,
            verifiedStatus: vStatus,
          });
          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Provider": pid,
              "X-Model": model,
              "X-Verified": vStatus,
            },
          });
        }

        const data: any = await res.json().catch(async () => ({ text: await res.text() }));
        if (data.choices) {
          c.header("X-Provider", pid);
          c.header("X-Verified", vStatus);
          const usage = data.usage;
          const total = usage?.total_tokens || estimated.total;
          if (usage?.total_tokens) recordUsage(pid, key, total);
          addLog({
            id: `req-${Date.now()}`,
            timestamp: new Date().toISOString(),
            virtualKeyId: vk?.id,
            virtualKeyName: vk?.name,
            provider: pid,
            model,
            promptTokens: usage?.prompt_tokens ?? estimated.prompt,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: total,
            latencyMs: latency,
            status: 200,
            verifiedStatus: vStatus,
          });
          return c.json(data);
        }
        addLog({
          id: `req-${Date.now()}`,
          timestamp: new Date().toISOString(),
          virtualKeyId: vk?.id,
          virtualKeyName: vk?.name,
          provider: pid,
          model,
          promptTokens: estimated.prompt,
          totalTokens: estimated.total,
          latencyMs: latency,
          status: 200,
          verifiedStatus: vStatus,
        });
        return c.json({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: `${pid}/${model}`,
          choices: [{ index: 0, message: { role: "assistant", content: typeof data === "string" ? data : JSON.stringify(data) }, finish_reason: "stop" }],
          usage: { prompt_tokens: estimated.prompt, completion_tokens: 0, total_tokens: estimated.total },
        });
      } catch (e: any) {
        logger.warn({ provider: pid, err: e.message }, "provider failed, trying next");
        errors.push({ provider: pid, error: e.message });
        recordFailure(pid);
        continue;
      }
    }

    // Log failure
    addLog({
      id: `req-${Date.now()}`,
      timestamp: new Date().toISOString(),
      virtualKeyId: vk?.id,
      virtualKeyName: vk?.name,
      provider: errors[0]?.provider || "none",
      model,
      promptTokens: estimated.prompt,
      totalTokens: estimated.total,
      latencyMs: Date.now() - startAll,
      status: 502,
      error: JSON.stringify(errors).slice(0, 500),
    });

    if (config.nodeEnv === "development" && errors.length > 0) {
      return c.json(
        {
          id: `chatcmpl-mock-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `[mock] All providers failed, returning mock. Errors: ${JSON.stringify(errors).slice(0, 900)} — configure API keys in .env to get real responses. You asked: "${(body.messages.at(-1)?.content as any)?.toString?.().slice(0, 100) || ""}"`,
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: estimated.prompt, completion_tokens: 20, total_tokens: estimated.total },
          _mock: true,
          _errors: errors,
        },
        200
      );
    }

    return c.json({ error: { message: "All providers failed", type: "provider_error", provider_errors: errors } }, 502);
  }
);
