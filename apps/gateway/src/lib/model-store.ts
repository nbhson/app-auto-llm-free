import { readDataJson } from "./paths.js";

/**
 * Centralized loaders for verified/health/live model data.
 * Replaces duplicated loadVerifiedMap() in chat.ts, anthropic.ts, models.ts
 * Uses readDataJson + in-memory TTL cache to avoid sync fs per-request.
 */

type VerifiedEntry = { id: string; status: string; [k: string]: unknown };
type HealthEntry = { http_status?: number; status?: string; [k: string]: unknown };

let verifiedCache: { map: Map<string, string>; at: number } | null = null;
let healthCache: { map: Map<string, HealthEntry>; raw: Record<string, HealthEntry>; at: number } | null = null;
let liveCache: { data: unknown[]; at: number } | null = null;

const TTL_MS = 5000;

export function loadVerifiedMap(): Map<string, string> {
  const now = Date.now();
  if (verifiedCache && now - verifiedCache.at < TTL_MS) return verifiedCache.map;
  const data = readDataJson<{ models?: VerifiedEntry[] }>("verified-models.json", { models: [] });
  const map = new Map<string, string>();
  for (const row of data.models || []) map.set(row.id, row.status);
  // merge persisted 404/410 from health
  const health = loadHealthMapRaw();
  for (const [id, v] of Object.entries(health)) {
    if (v.http_status === 404 || v.http_status === 410) map.set(id, "deprecated");
  }
  verifiedCache = { map, at: now };
  return map;
}

function loadHealthMapRaw(): Record<string, HealthEntry> {
  return readDataJson<Record<string, HealthEntry>>("model-health.json", {});
}

export function loadHealthMap(): Map<string, HealthEntry> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < TTL_MS) return healthCache.map;
  const data = loadHealthMapRaw();
  const map = new Map<string, HealthEntry>();
  for (const [id, v] of Object.entries(data || {})) map.set(id, v);
  healthCache = { map, raw: data, at: now };
  return map;
}

export function loadLiveModels(): Array<{
  id: string;
  raw_id: string;
  object: string;
  owned_by: string;
  provider: string;
  display_name: string;
  context_length: number;
  score: number;
  tier: string;
  live_status: string;
  capabilities: string[];
  limit: string;
  created: number;
}> {
  const now = Date.now();
  if (liveCache && now - liveCache.at < TTL_MS) return liveCache.data as never;
  const data = readDataJson<{ models?: Array<{ id: string; provider?: string; display_name?: string; context_length?: number }> }>("live-models.json", null as never);
  if (!data || !Array.isArray(data.models)) {
    liveCache = { data: [], at: now };
    return [];
  }
  const mapped = data.models.map((m) => ({
    id: m.id,
    raw_id: m.id,
    object: "model",
    owned_by: m.provider || m.id.split("/")[0],
    provider: m.provider || m.id.split("/")[0],
    display_name: m.display_name || m.id.split("/").pop() || m.id,
    context_length: m.context_length || 8192,
    score: 50,
    tier: "live",
    freellms_verified: false,
    no_card: true,
    capabilities: ["text"] as string[],
    limit: "live",
    created: 1715433600,
    live_status: "live",
  }));
  liveCache = { data: mapped, at: now };
  return mapped as never;
}

// For tests / manual invalidation
export function _resetModelStoreCache(): void {
  verifiedCache = null;
  healthCache = null;
  liveCache = null;
}
