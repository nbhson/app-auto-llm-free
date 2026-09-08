import { config } from "../config.js";
import { providers } from "../providers/registry.js";
import { getNextKeyManaged } from "./key-manager.js";
import { isOpen, recordSuccess, recordFailure } from "./circuit-breaker.js";
import { logger } from "../middleware/logger.js";

// Default fallback chain if EMBEDDING_FALLBACKS not set or primary fails.
// Order: Cohere primary (env), then nvidia-nim, cloudflare, then hash fallback (no embedding)
const DEFAULT_FALLBACKS = ["nvidia-nim/nvidia/nv-embed-v1", "cloudflare-workers-ai/@cf/baai/bge-large-en-v1.5"];

function getEmbeddingModels(): string[] {
  const primary = (config as any).embeddingModels as string[] | undefined;
  const fallbacks = (config as any).embeddingFallbacks as string[] | undefined;
  const list = [...(primary || [config.embeddingModel]), ...(fallbacks || DEFAULT_FALLBACKS)];
  // dedup preserve order
  return [...new Set(list)];
}

async function tryEmbedWithModel(text: string, model: string, timeoutMs = 4000): Promise<number[] | null> {
  const providerId = model.includes("/") ? model.split("/")[0] : "cohere";
  const provider: any = (providers as any)[providerId];
  if (!provider?.embeddings) {
    logger.warn({ provider: providerId, model }, "[embeddings] provider has no embeddings support, skipping");
    return null;
  }
  if (isOpen(providerId)) {
    logger.warn({ provider: providerId }, "[embeddings] circuit open, skipping");
    return null;
  }
  const key = getNextKeyManaged(providerId);
  if (key === null) {
    logger.warn({ provider: providerId }, "[embeddings] no key configured, skipping");
    return null;
  }
  // allow public fallback with empty key
  const trimmedModel = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  try {
    const res = await Promise.race([
      provider.embeddings({ model: trimmedModel, input: text }, key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("embed timeout")), timeoutMs)),
    ]) as Response;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      logger.warn({ provider: providerId, model, status: res.status, body: t.slice(0, 300) }, "[embeddings] non-ok");
      recordFailure(providerId);
      return null;
    }
    recordSuccess(providerId);
    const data: any = await res.json().catch(async () => ({ text: await (res as any).text() }));
    // OpenAI shape: { data: [{ embedding: [...] }], model }
    const emb = data?.data?.[0]?.embedding || data?.embedding || data?.data?.[0] || null;
    if (Array.isArray(emb) && emb.length > 0) return emb as number[];
    if (Array.isArray(data?.data) && Array.isArray(data.data[0])) return data.data[0] as number[];
    logger.warn({ provider: providerId, model, data: JSON.stringify(data).slice(0, 300) }, "[embeddings] unexpected shape");
    return null;
  } catch (e: any) {
    logger.warn({ provider: providerId, model, err: e.message }, "[embeddings] failed, will try fallback");
    recordFailure(providerId);
    return null;
  }
}

/**
 * Embed text with automatic fallback chain.
 * Tries EMBEDDING_MODEL primary first, then EMBEDDING_FALLBACKS, returns first success.
 * If all fail, returns null so caller can fallback to hash exact match.
 */
export async function embedWithFallback(text: string, timeoutMs = 2000): Promise<{ embedding: number[]; model: string } | null> {
  if (!text) return null;
  const models = getEmbeddingModels();
  for (const m of models) {
    const emb = await tryEmbedWithModel(text, m, timeoutMs);
    if (emb) {
      logger.info({ model: m, dim: emb.length }, "[embeddings] success");
      return { embedding: emb, model: m };
    }
  }
  logger.warn({ models }, "[embeddings] all fallbacks failed, will use hash fallback");
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function getFallbackModels(): string[] {
  return getEmbeddingModels();
}
