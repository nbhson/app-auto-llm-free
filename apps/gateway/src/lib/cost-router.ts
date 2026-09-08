import fs from "node:fs";
import { resolveDataPath } from "./paths.js";
import { getQuotaState } from "./quota-tracker.js";
import { logger } from "../middleware/logger.js";

export interface ProviderScore {
  provider: string;
  cost: number;
  latency: number;
  quotaHeadroom: number;
  score: number;
}

// $ per 1M tokens (input blended). Free = 0
export const FREELLMS_COST: Record<string, number> = {
  groq: 0.05,
  "nvidia-nim": 0,
  nvidia: 0,
  cerebras: 0,
  "google-gemini": 0,
  gemini: 0,
  "cloudflare-workers-ai": 0,
  cohere: 0,
  sambanova: 0,
  siliconflow: 0,
  "hugging-face": 0,
  huggingface: 0,
  "llm7-io": 0,
  pollinations: 0,
  openrouter: 0.1,
  "kilo-code": 0,
  "chutes-ai": 0,
  chutes: 0,
  "ovhcloud-ai-endpoints": 0,
  "agnes-ai": 0,
  modelscope: 0,
  "z-ai-zhipu-ai": 0,
  "mistral-ai": 0,
  mistral: 0,
  together: 0.08,
  fireworks: 0.07,
  "aion-labs": 0,
  deepseek: 0.14,
  sambanova_cohere: 0,
  nscale: 0,
  nebius: 0,
};

const STATS_PATH = resolveDataPath("provider-stats.json");

function getLatency(provider: string): number {
  try {
    if (fs.existsSync(STATS_PATH)) {
      const j = JSON.parse(fs.readFileSync(STATS_PATH, "utf-8"));
      // support { provider: { emaLatencyMs: number } } or { provider: number }
      const v = j[provider];
      if (typeof v === "number") return v;
      if (v && typeof v.emaLatencyMs === "number") return v.emaLatencyMs;
      if (v && typeof v.latency === "number") return v.latency;
    }
  } catch {}
  return 100; // mock 100ms fallback
}

function getQuotaHeadroom(provider: string): number {
  try {
    const state = getQuotaState(provider, "");
    const limits: any = state.limits;
    if (!limits) return 1;
    let headroom = 1;
    let count = 0;
    if (limits.rpm) {
      const used = state.rpm?.count ?? 0;
      const remaining = Math.max(0, limits.rpm - used) / limits.rpm;
      headroom = Math.min(headroom, remaining);
      count++;
    }
    if (limits.tpm) {
      const used = state.tpm?.count ?? 0;
      const remaining = Math.max(0, limits.tpm - used) / limits.tpm;
      headroom = Math.min(headroom, remaining);
      count++;
    }
    if (limits.rpd) {
      // no window tracking for rpd, assume 1
      headroom = Math.min(headroom, 1);
      count++;
    }
    return count === 0 ? 1 : headroom;
  } catch {
    return 1;
  }
}

/**
 * Rank providers by weighted cost + latency - quota headroom.
 * Lower score is better. Sort ascending.
 */
export function rankProvidersByCostAndLatency(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number } = {},
): string[] {
  const costWeight = opts.costWeight ?? 1;
  const latencyWeight = opts.latencyWeight ?? 0.01;

  const scored: ProviderScore[] = providerIds.map((provider) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const latency = getLatency(provider);
    const quotaHeadroom = getQuotaHeadroom(provider);
    const score = cost * costWeight + latency * latencyWeight - quotaHeadroom * 0.2;
    return { provider, cost, latency, quotaHeadroom, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.provider);
}

export function scoreProviders(providerIds: string[], opts?: { costWeight?: number; latencyWeight?: number }): ProviderScore[] {
  const costWeight = opts?.costWeight ?? 1;
  const latencyWeight = opts?.latencyWeight ?? 0.01;
  const scored: ProviderScore[] = providerIds.map((provider) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const latency = getLatency(provider);
    const quotaHeadroom = getQuotaHeadroom(provider);
    const score = cost * costWeight + latency * latencyWeight - quotaHeadroom * 0.2;
    return { provider, cost, latency, quotaHeadroom, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

/**
 * Sync pricing from LiteLLM CDN, fallback to hardcoded FREELLMS_COST.
 * Stub: fetches then merges into FREELLMS_COST map (in-memory).
 */
export async function syncPricing(): Promise<Record<string, number>> {
  const url = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    let updated = 0;
    for (const [key, val] of Object.entries(data)) {
      const v: any = val;
      const price = v.input_cost_per_token ?? v.input_cost_per_1k_tokens ?? null;
      if (typeof price === "number" && price > 0) {
        // map some model keys back to provider slug heuristics
        const slug = key.split("/")[0];
        if (FREELLMS_COST[slug] !== undefined) {
          FREELLMS_COST[slug] = price * 1_000_000;
          updated++;
        }
      }
    }
    logger.info({ updated }, "[cost-router] pricing synced from LiteLLM CDN");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[cost-router] syncPricing fallback to hardcoded");
  }
  return { ...FREELLMS_COST };
}
