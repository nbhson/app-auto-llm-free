import { providers } from "../providers/registry.js";
import { config } from "../config.js";

export type ModelHealth = {
  id: string; // e.g. nvidia-nim/z-ai/glm-5.2
  provider: string;
  model: string; // raw after slash
  status: "usable" | "unusable" | "no-key" | "error" | "timeout";
  latency_ms?: number;
  error?: string;
  http_status?: number;
};

/**
 * Probe a single model via minimal chat completion.
 * Uses provider.chat with tiny prompt, max_tokens 5, no stream.
 */
export async function probeModel(providerId: string, fullModelId: string, timeoutMs = 8000): Promise<ModelHealth> {
  const provider = (providers as any)[providerId];
  if (!provider) return { id: fullModelId, provider: providerId, model: fullModelId, status: "error", error: "unknown provider" };

  const keys = config.providerKeys[providerId] || [];
  const isPublic = ["pollinations", "llm7-io", "ollama-cloud", "glhf-chat", "glhf"].includes(providerId);
  if (keys.length === 0 && !isPublic) {
    return { id: fullModelId, provider: providerId, model: fullModelId, status: "no-key", error: "no API key configured" };
  }
  const key = keys[0] || "";

  // Extract model after provider prefix for providers that need it, but keep full for gateway routing
  // For probe, we pass fullModelId (gateway will handle prefix stripping in openai-compatible)
  const start = Date.now();
  try {
    const res = await Promise.race([
      provider.chat(
        {
          model: fullModelId,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
          temperature: 0,
          stream: false,
        } as any,
        key
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);

    const latency = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRateLimit = res.status === 429;
      return {
        id: fullModelId,
        provider: providerId,
        model: fullModelId,
        status: isRateLimit ? "error" : "unusable",
        latency_ms: latency,
        error: text.slice(0, 600),
        http_status: res.status,
      };
    }
    // Try to parse as OpenAI shape
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { text }; }
    const ok = data.choices || data.candidates || data.text || data.content;
    return {
      id: fullModelId,
      provider: providerId,
      model: fullModelId,
      status: ok ? "usable" : "unusable",
      latency_ms: latency,
      http_status: res.status,
    };
  } catch (e: any) {
    return {
      id: fullModelId,
      provider: providerId,
      model: fullModelId,
      status: e.message === "timeout" ? "timeout" : "error",
      latency_ms: Date.now() - start,
      error: e.message,
    };
  }
}

export async function probeModels(modelIds: string[], opts?: { timeoutMs?: number; concurrency?: number }): Promise<ModelHealth[]> {
  const concurrency = opts?.concurrency ?? 5;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const results: ModelHealth[] = [];
  // Chunked concurrency
  for (let i = 0; i < modelIds.length; i += concurrency) {
    const chunk = modelIds.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((fullId) => {
        const providerId = fullId.split("/")[0];
        return probeModel(providerId, fullId, timeoutMs);
      })
    );
    results.push(...chunkResults);
    // Small delay to avoid rate limit burst
    if (i + concurrency < modelIds.length) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}
