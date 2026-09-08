import { logger } from "../middleware/logger.js";

// Freellms limits mapping (from docs/CONFIGURATION.md + freellms scan)
export const FREELLMS_LIMITS: Record<string, { rpm?: number; rpd?: number; tpm?: number; tpd?: number; note?: string }> = {
  "nvidia-nim": { rpm: 40, note: "40 shared, phone required" },
  groq: { rpm: 30, rpd: 14400, note: "30 RPM primary, per-model" },
  cerebras: { rpm: 15, tpm: 30000, tpd: 1000000 },
  "google-gemini": { rpm: 15, rpd: 1500, tpd: 1500 },
  gemini: { rpm: 15, rpd: 1500 },
  "ovhcloud-ai-endpoints": { rpm: 2, note: "2 anon" },
  "agnes-ai": { rpm: 30 },
  openrouter: { rpd: 200 },
  "kilo-code": { rpm: 3, note: "~200/hr" }, // 200/hr ~3/min
  cohere: { rpm: 30 },
  sambanova: { rpm: 30 },
  siliconflow: { rpm: 30 },
  "llm7-io": { rpm: 30 },
  "chutes-ai": { rpm: 30 },
  "glhf-chat": { rpm: 30 },
  pollinations: { rpm: 60, note: "no key, public" },
};

type Window = { count: number; resetAt: number };

const rpmWindows = new Map<string, Window>(); // key: provider or virtualKey
const tpmWindows = new Map<string, Window>();
const rpdWindows = new Map<string, Window>(); // 24h
const tpdWindows = new Map<string, Window>();

function windowKey(provider: string, keyPrefix: string) {
  return `${provider}:${keyPrefix}`;
}

export function checkQuota(provider: string, key: string, estimatedTokens: number): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return { allowed: true };
  const now = Date.now();
  const k = windowKey(provider, key.slice(0, 8));

  // RPM check (60s window)
  if (limits.rpm) {
    let w = rpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    if (w.count >= limits.rpm) {
      return { allowed: false, reason: `RPM limit ${limits.rpm} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // TPM check
  if (limits.tpm) {
    let w = tpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    if (w.count + estimatedTokens > limits.tpm) {
      return { allowed: false, reason: `TPM limit ${limits.tpm} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // RPD check (24h)
  if (limits.rpd) {
    let w = rpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    if (w.count >= limits.rpd) {
      return { allowed: false, reason: `RPD limit ${limits.rpd} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // TPD check (24h)
  if (limits.tpd) {
    let w = tpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    if (w.count + estimatedTokens > limits.tpd) {
      return { allowed: false, reason: `TPD limit ${limits.tpd} exceeded`, retryAfterMs: w.resetAt - now };
    }
  }

  // Try Redis if available for distributed quota (fallback to in-memory if not)
  // Note: Redis path is async but checkQuota is sync for now; we keep in-memory as primary and rely on key-manager cooldown for distributed 429
  return { allowed: true };
}

export function recordUsage(provider: string, key: string, tokens: number) {
  const now = Date.now();
  const k = windowKey(provider, key.slice(0, 8));
  const limits = FREELLMS_LIMITS[provider];
  if (limits?.rpm) {
    let w = rpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    w.count++;
    rpmWindows.set(k, w);
  }
  if (limits?.tpm) {
    let w = tpmWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
    w.count += tokens;
    tpmWindows.set(k, w);
  }
  if (limits?.rpd) {
    let w = rpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    w.count++;
    rpdWindows.set(k, w);
  }
  if (limits?.tpd) {
    let w = tpdWindows.get(k);
    if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 86400000 };
    w.count += tokens;
    tpdWindows.set(k, w);
  }
  // Also try to increment Redis counters if available (best-effort, async)
  try {
    // dynamic import to avoid circular dep
    import("./redis.js").then(({ getRedis }) => {
      const r: any = getRedis?.();
      if (!r) return;
      const dayKey = `quota:${k}:${Math.floor(now / 86400000)}`;
      r.incr(dayKey).catch(() => {});
      r.expire(dayKey, 86400).catch(() => {});
    }).catch(() => {});
  } catch {}
  logger.debug({ provider, tokens, k }, "quota usage recorded");
}

export function getQuotaState(provider: string, key: string) {
  const limits = FREELLMS_LIMITS[provider];
  const k = windowKey(provider, key.slice(0, 8));
  return {
    provider,
    limits,
    rpm: rpmWindows.get(k),
    tpm: tpmWindows.get(k),
    rpd: rpdWindows.get(k),
    tpd: tpdWindows.get(k),
  };
}
function getWorstHeadroomForProvider(provider: string): number {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return 1;
  const prefix = `${provider}:`;
  let worst = 1;
  let found = false;
  const consider = (map: Map<string, Window>, limit?: number) => {
    if (!limit) return;
    for (const [k, w] of map.entries()) {
      if (!k.startsWith(prefix)) continue;
      found = true;
      const h = Math.max(0, 1 - w.count / limit);
      worst = Math.min(worst, h);
    }
  };
  consider(rpmWindows, limits.rpm);
  consider(tpmWindows, limits.tpm);
  consider(rpdWindows, limits.rpd);
  consider(tpdWindows, limits.tpd);
  return found ? worst : 1;
}
export function getQuotaHeadroom(provider: string, key: string): number {
  const limits = FREELLMS_LIMITS[provider];
  if (!limits) return 1;
  // empty key => aggregate across all keys for provider (fix cost-router always 1 bug)
  if (!key) return getWorstHeadroomForProvider(provider);
  const st = getQuotaState(provider, key);
  // if no window yet for this specific key but other keys exist, fall back to worst
  if (!st.rpm && !st.tpm && !st.rpd && !st.tpd) return getWorstHeadroomForProvider(provider);
  let headroom = 1;
  if (limits.rpm && st.rpm) headroom = Math.min(headroom, 1 - st.rpm.count / limits.rpm);
  if (limits.tpm && st.tpm) headroom = Math.min(headroom, 1 - st.tpm.count / limits.tpm);
  if (limits.rpd && st.rpd) headroom = Math.min(headroom, 1 - st.rpd.count / limits.rpd);
  if (limits.tpd && st.tpd) headroom = Math.min(headroom, 1 - st.tpd.count / limits.tpd);
  return Math.max(0, headroom);
}
