import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../../config.js";
import { getProvidersForRequest, getNextKey } from "../../lib/router.js";
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
    })
  ),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  top_p: z.number().optional(),
});

export const chatRoute = new Hono();

chatRoute.post(
  "/completions",
  zValidator("json", chatSchema),
  async (c) => {
    const body = c.req.valid("json");
    const model = body.model || config.defaultModel;
    const providerOrder = getProvidersForRequest(model, "tiered");

    // Try providers in order with stub fallback
    const errors: any[] = [];
    for (const pid of providerOrder) {
      const provider = providers[pid];
      if (!provider) continue;
      const key = getNextKey(pid);
      if (key === null) {
        errors.push({ provider: pid, error: "no key configured" });
        continue;
      }
      try {
        // For providers without key (pollinations) we still try; for others if key empty skip
        if (pid !== "pollinations" && !key) {
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
          },
          key
        );

        // If provider returned error, fallback
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          errors.push({ provider: pid, status: res.status, error: text.slice(0, 500) });
          // 401/403 shouldn't fallback to same tier? but for P1 we fallback anyway unless 400
          if (res.status === 400) break;
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
