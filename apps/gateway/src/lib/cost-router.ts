import fs from "node:fs";
import { resolveDataPath } from "./paths.js";
import { getQuotaHeadroom as getQuotaHeadroomFromTracker } from "./quota-tracker.js";
import { logger } from "../middleware/logger.js";
import { config } from "../config.js";

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
  nscale: 0,
  nebius: 0,
};

const STATS_PATH = resolveDataPath("provider-stats.json");
let latencyCache: { data: Record<string, any>; loadedAt: number } | null = null;
const LATENCY_CACHE_TTL_MS = 5000;
let latencyWatchInitialized = false;

function ensureLatencyWatcher(): void {
  if (latencyWatchInitialized) return;
  latencyWatchInitialized = true;
  try {
    fs.watchFile(STATS_PATH, { interval: 5000 }, () => {
      latencyCache = null;
    });
  } catch {}
}

export function stopLatencyWatcher(): void {
  try {
    fs.unwatchFile(STATS_PATH);
  } catch {}
  latencyWatchInitialized = false;
}

async function loadLatencyData(): Promise<Record<string, any> | null> {
  try {
    const now = Date.now();
    if (latencyCache && now - latencyCache.loadedAt < LATENCY_CACHE_TTL_MS) {
      return latencyCache.data;
    }
    ensureLatencyWatcher();
    if (!fs.existsSync(STATS_PATH)) return null;
    const raw = await fs.promises.readFile(STATS_PATH, "utf-8");
    const j = JSON.parse(raw);
    latencyCache = { data: j, loadedAt: now };
    return j;
  } catch {
    return null;
  }
}

function getLatency(provider: string): number {
  try {
    const now = Date.now();
    let j: Record<string, any> | null = null;
    if (latencyCache && now - latencyCache.loadedAt < LATENCY_CACHE_TTL_MS) {
      j = latencyCache.data;
    } else {
      // sync fallback for hot path (kept for backward compat); async version preferred via getLatencyAsync
      if (!fs.existsSync(STATS_PATH)) return 100;
      // avoid blocking: return cached or fallback, async load will refresh next call
      if (latencyCache) j = latencyCache.data;
      else {
        ensureLatencyWatcher();
        // trigger async refresh without blocking
        loadLatencyData().catch(() => {});
        return 100;
      }
    }
    if (!j) return 100;
    const v = (j as any)[provider];
    if (typeof v === "number") return v;
    if (v && typeof v.emaLatencyMs === "number") return v.emaLatencyMs;
    if (v && typeof v.latency === "number") return v.latency;
  } catch {}
  return 100; // fallback
}

export async function getLatencyAsync(provider: string): Promise<number> {
  const j = await loadLatencyData();
  if (!j) return 100;
  const v = (j as any)[provider];
  if (typeof v === "number") return v;
  if (v && typeof v.emaLatencyMs === "number") return v.emaLatencyMs;
  if (v && typeof v.latency === "number") return v.latency;
  return 100;
}

function getQuotaHeadroom(provider: string): number {
  try {
    // Use empty key to get average headroom across keys; if tracker supports aggregation it will return avg,
    // otherwise fallback to 1 (no quota pressure)
    return getQuotaHeadroomFromTracker(provider, "");
  } catch {
    return 1;
  }
}

let syncPricingLock = false;
let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1h

const DEFAULT_COST_WEIGHT = 5; // cost dominates latency (free-first)
const DEFAULT_LATENCY_WEIGHT = 0.0005; // half previous to ensure cheapest wins
const HEADROOM_WEIGHT = 0.3; // quota pressure more visible

function resolveWeights(opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number } = {}): {
  costWeight: number;
  latencyWeight: number;
  headroomWeight: number;
} {
  // harness 06 Decide Tools: env overrides allow A/B testing without code change
  // Direct import — config has no circular dependency on cost-router (verified)
  const cfg: any = config as any;
  return {
    costWeight: opts.costWeight ?? cfg?.costWeight ?? DEFAULT_COST_WEIGHT,
    latencyWeight: opts.latencyWeight ?? cfg?.latencyWeight ?? DEFAULT_LATENCY_WEIGHT,
    headroomWeight: opts.headroomWeight ?? cfg?.headroomWeight ?? HEADROOM_WEIGHT,
  };
}

function buildScores(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number } = {},
): ProviderScore[] {
  const { costWeight, latencyWeight, headroomWeight } = resolveWeights(opts);
  const scored: ProviderScore[] = providerIds.map((provider) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const latency = getLatency(provider);
    const quotaHeadroom = getQuotaHeadroom(provider);
    const score = cost * costWeight + latency * latencyWeight - quotaHeadroom * headroomWeight;
    return { provider, cost, latency, quotaHeadroom, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

export async function buildScoresAsync(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number } = {},
): Promise<ProviderScore[]> {
  const { costWeight, latencyWeight, headroomWeight } = resolveWeights(opts);
  const latencies = await Promise.all(providerIds.map((p) => getLatencyAsync(p)));
  const scored: ProviderScore[] = providerIds.map((provider, idx) => {
    const cost = FREELLMS_COST[provider] ?? 0.05;
    const latency = latencies[idx];
    const quotaHeadroom = getQuotaHeadroom(provider);
    const score = cost * costWeight + latency * latencyWeight - quotaHeadroom * headroomWeight;
    return { provider, cost, latency, quotaHeadroom, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

/**
 * Rank providers by weighted cost + latency - quota headroom.
 * Lower score is better. Sort ascending.
 * Env COST_WEIGHT/LATENCY_WEIGHT/HEADROOM_WEIGHT now override defaults (harness 06).
 */
export function rankProvidersByCostAndLatency(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number } = {},
): string[] {
  return buildScores(providerIds, opts).map((s) => s.provider);
}

export async function rankProvidersByCostAndLatencyAsync(
  providerIds: string[],
  opts: { costWeight?: number; latencyWeight?: number; headroomWeight?: number } = {},
): Promise<string[]> {
  return (await buildScoresAsync(providerIds, opts)).map((s) => s.provider);
}

export function scoreProviders(
  providerIds: string[],
  opts?: { costWeight?: number; latencyWeight?: number; headroomWeight?: number },
): ProviderScore[] {
  return buildScores(providerIds, opts);
}

export async function scoreProvidersAsync(
  providerIds: string[],
  opts?: { costWeight?: number; latencyWeight?: number; headroomWeight?: number },
): Promise<ProviderScore[]> {
  return buildScoresAsync(providerIds, opts);
}

/**
 * Sync pricing from LiteLLM CDN, fallback to hardcoded FREELLMS_COST.
 * Handles both input_cost_per_token and input_cost_per_1k_tokens with proper normalization.
 * Now with cooldown + lock to avoid concurrent fetch storms.
 */
export async function syncPricing(): Promise<Record<string, number>> {
  if (syncPricingLock) {
    logger.info("[cost-router] syncPricing already in progress, skip");
    return { ...FREELLMS_COST };
  }
  if (Date.now() - lastSyncAt < SYNC_COOLDOWN_MS) {
    return { ...FREELLMS_COST };
  }
  syncPricingLock = true;
  const url = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    let updated = 0;
    for (const [key, val] of Object.entries(data)) {
      const v: any = val;
      let perToken: number | null = null;
      if (typeof v.input_cost_per_token === "number" && v.input_cost_per_token > 0) perToken = v.input_cost_per_token;
      else if (typeof v.input_cost_per_token === "string" && parseFloat(v.input_cost_per_token) > 0) perToken = parseFloat(v.input_cost_per_token);
      else if (typeof v.input_cost_per_1k_tokens === "number" && v.input_cost_per_1k_tokens > 0) perToken = v.input_cost_per_1k_tokens / 1000;
      if (perToken !== null && perToken > 0) {
        const slug = key.split("/")[0].toLowerCase();
        if (FREELLMS_COST[slug] !== undefined) {
          FREELLMS_COST[slug] = perToken * 1_000_000;
          updated++;
        }
      }
    }
    lastSyncAt = Date.now();
    logger.info({ updated }, "[cost-router] pricing synced from LiteLLM CDN");
  } catch (err) {
    // cooldown on failure too — avoid hammering CDN on repeated errors (15min cooldown)
    lastSyncAt = Date.now();
    logger.warn({ err: (err as Error).message }, "[cost-router] syncPricing fallback to hardcoded");
  } finally {
    syncPricingLock = false;
  }
  return { ...FREELLMS_COST };
}
