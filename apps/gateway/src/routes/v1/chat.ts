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
import { compressWithMetrics } from "../../lib/compression.js";
import { logGenAI } from "../../lib/otel.js";
import { FREELLMS_COST, rankProvidersByCostAndLatency } from "../../lib/cost-router.js";
import { semanticCache } from "../../lib/semantic-cache.js";
import { loadVerifiedMap, loadHealthMap } from "../../lib/model-store.js";
import { getRequestVk, errMessage, type ProviderError, type UpstreamChatCompletion, type CompressibleMessage } from "../../lib/types.js";
import type { ChatMessage } from "../../providers/base.js";

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

export const chatRoute = new Hono();

chatRoute.post(
  "/completions",
  zValidator("json", chatSchema),
  async (c) => {
    const body = c.req.valid("json");
    const model = body.model || config.defaultModel;
    const vk = getRequestVk(c);

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
    // Only skip providers where the model is explicitly deprecated AND has health data
    const verifiedMap = loadVerifiedMap();
    const healthMap = loadHealthMap();
    if (model.includes("/") && verifiedMap.get(model) === "deprecated") {
      logger.warn({ model }, "requested model is deprecated, will fallback to other providers");
      // Don't blindly filter by prefix - instead check per-provider health
      // If the requesting provider has health data showing usable, keep it
      const prefix = model.split("/")[0];
      const healthEntry = healthMap.get(model);
      // Only filter out if the specific provider-model combination is unusable
      if (healthEntry && healthEntry.status !== "usable") {
        providerOrder = providerOrder.filter((p) => p !== prefix);
        logger.info({ model, filteredOut: prefix }, "filtered deprecated provider");
      }
    }

    // Vector 2: cost-aware re-ranking (skip if x-router pinned)
    if (config.costRoutingEnabled && !pinned && providerOrder.length > 1) {
      try {
        providerOrder = rankProvidersByCostAndLatency(providerOrder);
        logger.info({ providerOrder }, "cost routing re-ranked");
      } catch { /* ignore */ }
    }

    const estimated = estimateChatTokens({ messages: body.messages, max_tokens: body.max_tokens });
    const startAll = Date.now();
    const errors: ProviderError[] = [];

    // Vector 2: semantic cache check first (cheapest) - only for non-stream
    // harness 01 Retrieve: tenant-aware key (vkId + tools + temperature) prevents poisoning
    let cacheHitContent: string | null = null;
    if (config.semanticCacheEnabled && !body.stream) {
      try {
        const q = JSON.stringify(body.messages);
        cacheHitContent = await semanticCache.get(q, model, {
          vkId: vk?.id,
          tools: body.tools,
          temperature: body.temperature,
        });
        if (cacheHitContent) {
          logger.info({ model, vkId: vk?.id }, "semantic cache hit");
          logGenAI("chat", { model, provider: "cache", promptTokens: estimated.prompt, latencyMs: Date.now() - startAll, cacheHit: true });
          addLog({ id: `req-${Date.now()}`, timestamp: new Date().toISOString(), virtualKeyId: vk?.id, virtualKeyName: vk?.name, provider: "cache", model, promptTokens: estimated.prompt, completionTokens: estimateChatTokens({ messages: [{ role: "assistant", content: cacheHitContent }] }).prompt, totalTokens: estimated.prompt + 20, latencyMs: Date.now() - startAll, status: 200, verifiedStatus: "cache", cacheHit: true });
          return c.json({ id: `chatcmpl-cache-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: "assistant", content: cacheHitContent }, finish_reason: "stop" }], usage: { prompt_tokens: estimated.prompt, completion_tokens: 20, total_tokens: estimated.prompt + 20 } });
        }
      } catch { /* ignore */ }
    }

    // Vector 2: optional compression (only on cache miss) - harness 02 Build Context pipeline
    // Workflow Stage: metrics + guard + token budget
    let messagesToSend: CompressibleMessage[] = body.messages;
    let compressionRatio: number | undefined;
    let compressedTokens: number | undefined;
    if (config.compressionEnabled && body.messages?.length > 6) {
      const maxTokens = config.compressionMaxTokens || 4096;
      const comp = compressWithMetrics(body.messages, { maxTokens: estimated.prompt > maxTokens ? maxTokens : undefined });
      if (comp.metrics.applied) {
        messagesToSend = comp.messages;
        compressionRatio = comp.ratio;
        compressedTokens = Math.max(0, estimated.prompt - comp.savedTokens);
        logger.info({ model, original: body.messages.length, compressed: messagesToSend.length, ratio: comp.ratio, savedTokens: comp.savedTokens, durationMs: comp.metrics.durationMs }, "compression applied");
      }
    }
    const estimatedForQuota = estimateChatTokens({ messages: messagesToSend, max_tokens: body.max_tokens });

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

      // Quota pre-check (RPM/TPM/RPD/TPD)
      const quota = checkQuota(pid, key, (typeof estimatedForQuota !== "undefined" ? estimatedForQuota.total : estimated.total));
      if (!quota.allowed) {
        errors.push({ provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs });
        if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
        continue;
      }

      // Skip deprecated model for this provider if verified AND provider is NOT the original requesting provider
      // If user explicitly requests kilo-code/..., allow kilo-code to serve it even if marked deprecated
      const fullId = model.includes("/") ? model : `${pid}/${model}`;
      const requestedPrefix = model.split("/")[0];
      const isRequestingProvider = pid === requestedPrefix;
      if (verifiedMap.get(fullId) === "deprecated" && !isRequestingProvider) {
        errors.push({ provider: pid, error: "model deprecated per verified-models.json" });
        continue;
      }

      // Extract session IDs for providers that require them (opencode free tier, etc.)
      const sessionId = c.req.header("x-session-id") || c.req.header("X-Session-ID") || undefined;
      const parentSessionId = c.req.header("x-parent-session-id") || c.req.header("X-Parent-Session-ID") || undefined;

      try {
        const res = await provider.chat(
          {
            model,
            messages: messagesToSend as unknown as ChatMessage[],
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
            sessionId,
            parentSessionId,
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
        logGenAI("chat", { provider: pid, model, promptTokens: estimated.prompt, latencyMs: latency, traceId: `req-${Date.now()}` });

        if (body.stream) {
          const contentType = res.headers.get("content-type") || "text/event-stream";
          const per1M = FREELLMS_COST[pid] ?? 0.05;
          const streamCost = (estimated.total / 1_000_000) * per1M;
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
            compressedTokens,
            compressionRatio,
            cost: Number(streamCost.toFixed(6)),
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

        const data = (await res.json().catch(async () => ({ text: await res.text() }))) as UpstreamChatCompletion;
        if (data.choices) {
          c.header("X-Provider", pid);
          c.header("X-Verified", vStatus);
          const usage = data.usage;
          const total = usage?.total_tokens || estimated.total;
          if (usage?.total_tokens) recordUsage(pid, key, total);
          const per1M2 = FREELLMS_COST[pid] ?? 0.05;
          const actualCost = (total / 1_000_000) * per1M2;
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
            compressedTokens,
            compressionRatio,
            cost: Number(actualCost.toFixed(6)),
          });
          // Vector 2: store in semantic cache if enabled - background async (harness 10 Automation, non-blocking)
          if (config.semanticCacheEnabled) {
            const text = data.choices?.[0]?.message?.content || "";
            if (text) {
              semanticCache.setBackground(
                { model, query: JSON.stringify(body.messages), tools: body.tools, temperature: body.temperature, vkId: vk?.id },
                String(text),
              );
            }
          }
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
      } catch (e) {
        logger.warn({ provider: pid, err: errMessage(e) }, "provider failed, trying next");
        errors.push({ provider: pid, error: errMessage(e) });
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

    if (process.env.ALLOW_MOCK === "1" && config.nodeEnv === "development" && errors.length > 0) {
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
                content: `[mock] All providers failed, returning mock. Errors: ${JSON.stringify(errors).slice(0, 900)} — configure API keys in .env to get real responses. You asked: "${String(body.messages.at(-1)?.content ?? "").slice(0, 100)}"`,
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
