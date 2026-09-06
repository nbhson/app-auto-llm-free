import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { getProvidersForRequest, getNextKey, isPublicProvider } from "../../lib/router.js";
import { providers } from "../../providers/registry.js";
import { logger } from "../../middleware/logger.js";

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

    // x-router header to pin provider (e.g. x-router: nvidia-nim)
    const pinned = c.req.header("x-router")?.trim();
    let providerOrder: string[];
    if (pinned && providers[pinned]) {
      providerOrder = [pinned, ...getProvidersForRequest(model, "tiered").filter((p) => p !== pinned)];
      logger.info({ pinned, model }, "x-router pinned");
    } else {
      providerOrder = getProvidersForRequest(model, "tiered");
    }

    const errors: any[] = [];
    for (const pid of providerOrder) {
      const provider = providers[pid];
      if (!provider) continue;
      const key = getNextKey(pid);
      if (key === null) {
        errors.push({ provider: pid, error: "no key configured (set " + pid.toUpperCase().replace(/-/g, "_") + "_API_KEYS)" });
        continue;
      }
      try {
        // Allow public providers without key (pollinations, llm7-io, hugging-face)
        if (!key && !isPublicProvider(pid)) {
          errors.push({ provider: pid, error: "missing key" });
          continue;
        }
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

        // If provider returned error, fallback to next tier
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          errors.push({ provider: pid, status: res.status, error: text.slice(0, 500) });
          continue;
        }

        // Streaming: passthrough SSE
        if (body.stream) {
          const contentType = res.headers.get("content-type") || "text/event-stream";
          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Provider": pid,
              "X-Model": model,
            },
          });
        }

        // Non-stream: if provider already returns OpenAI shape (most), passthrough; Gemini already normalized
        const data: any = await res.json().catch(async () => ({ text: await res.text() }));
        // Ensure we have OpenAI shape fallback
        if (data.choices) {
          c.header("X-Provider", pid);
          return c.json(data);
        }
        // Raw text fallback to OpenAI shape
        return c.json({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: `${pid}/${model}`,
          choices: [{ index: 0, message: { role: "assistant", content: typeof data === "string" ? data : JSON.stringify(data) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      } catch (e: any) {
        logger.warn({ provider: pid, err: e.message }, "provider failed, trying next");
        errors.push({ provider: pid, error: e.message });
        continue;
      }
    }

    // All failed — return mock for dev so SDK doesn't break (remove in production strict mode)
    if (config.nodeEnv === "development" && errors.length > 0) {
      // Return a deterministic mock so frontend dev continues
      return c.json({
        id: `chatcmpl-mock-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `[mock] All providers failed, returning mock. Errors: ${JSON.stringify(errors).slice(0, 800)} — configure API keys in .env to get real responses. You asked: "${body.messages.at(-1)?.content}"`,
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        _mock: true,
        _errors: errors,
      });
    }

    return c.json({ error: { message: "All providers failed", type: "provider_error", provider_errors: errors } }, 502);
  }
);
