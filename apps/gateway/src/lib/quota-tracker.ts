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
  "hugging-face": { rpm: 30 },
  "llm7-io": { rpm: 30 },
  "chutes-ai": { rpm: 30 },
  "glhf-chat": { rpm: 30 },
  pollinations: { rpm: 60, note: "no key, public" },
};

type Window = { count: number; resetAt: number };

const rpmWindows = new Map<string, Window>(); // key: provider or virtualKey
const tpmWindows = new Map<string, Window>();

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
  };
}
