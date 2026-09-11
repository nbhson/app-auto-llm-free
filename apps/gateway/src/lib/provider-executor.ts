import type { Provider } from "../providers/base.js";
import { providers } from "../providers/registry.js";
import { getNextKeyManaged, markRateLimited, markSuccess } from "./key-manager.js";
import { checkQuotaAsync, recordUsage } from "./quota-tracker.js";
import { isOpen, recordSuccess, recordFailureIfRetryable } from "./circuit-breaker.js";
import { logger } from "../middleware/logger.js";
import { isPublicProvider } from "./provider-keys.js";
import { errMessage, type ProviderError } from "./types.js";
import { config } from "../config.js";

/**
 * Shared provider fallback executor — single implementation of the
 * breaker → key → quota → skip → call → bookkeeping loop previously
 * duplicated across chat/anthropic/responses/embeddings/images/audio.
 *
 * Behavior preserved per route via options:
 * - quotaTokens: estimated tokens for quota pre-check + usage commit.
 *   Omit to skip quota entirely (embeddings/images/audio legacy behavior).
 * - shouldSkip: per-provider veto (e.g. deprecated model) returning a reason.
 */

export interface ProviderAttempt {
  providerId: string;
  provider: Provider;
  key: string;
}

export interface TryProvidersOpts {
  providerOrder: string[];
  quotaTokens?: number;
  shouldSkip?: (providerId: string) => string | null;
  call: (attempt: ProviderAttempt) => Promise<Response>;
  timeoutMs?: number;
  parallel?: number;
}

export type TryProvidersResult =
  | { ok: true; providerId: string; key: string; res: Response }
  | { ok: false; errors: ProviderError[] };

async function tryProvidersParallel(opts: TryProvidersOpts, batchSize: number): Promise<TryProvidersResult> {
  const errors: ProviderError[] = [];
  for (let i = 0; i < opts.providerOrder.length; i += batchSize) {
    const batch = opts.providerOrder.slice(i, i + batchSize);
    const attempts = batch.map(async (pid): Promise<{ providerId: string; key: string; res: Response }> => {
      const provider = providers[pid];
      if (!provider) throw { provider: pid, error: "unknown provider" } as ProviderError;
      if (isOpen(pid)) throw { provider: pid, error: "circuit open (cooldown)" } as ProviderError;
      const key = getNextKeyManaged(pid);
      if (key === null) throw { provider: pid, error: `no key configured (set ${pid.toUpperCase().replace(/-/g, "_")}_API_KEYS)` } as ProviderError;
      if (!key && !isPublicProvider(pid)) throw { provider: pid, error: "missing key" } as ProviderError;
      if (opts.quotaTokens !== undefined) {
        const quota = await checkQuotaAsync(pid, key, opts.quotaTokens!);
        if (!quota.allowed) {
          if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
          throw { provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs } as ProviderError;
        }
      }
      if (opts.shouldSkip) {
        const reason = opts.shouldSkip(pid);
        if (reason) throw { provider: pid, error: reason } as ProviderError;
      }
      const timeoutMs = opts.timeoutMs ?? config.providerTimeoutMs;
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`provider timeout after ${timeoutMs}ms — thử model khác hoặc tắt Web Tools (Globe) nếu bật`)), timeoutMs);
        timer.unref?.();
      });
      try {
        const res = await Promise.race([opts.call({ providerId: pid, provider, key }), timeout]);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let retryAfterMs: number | undefined;
          if (res.status === 429) {
            const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
            retryAfterMs = Number.isNaN(retry) ? 60000 : retry;
            markRateLimited(pid, key, retryAfterMs);
          }
          recordFailureIfRetryable(pid, res.status);
          throw { provider: pid, status: res.status, error: text.slice(0, 600), retryAfterMs } as ProviderError;
        }
        recordSuccess(pid);
        markSuccess(pid, key);
        if (opts.quotaTokens !== undefined) recordUsage(pid, key, opts.quotaTokens!);
        return { providerId: pid, key, res };
      } finally { if (timer) clearTimeout(timer); }
    });
    try {
      const winner = await Promise.any(attempts);
      return { ok: true, providerId: winner.providerId, key: winner.key, res: winner.res };
    } catch {
      const settled = await Promise.allSettled(attempts);
      for (const r of settled) if (r.status === "rejected") errors.push(r.reason as ProviderError);
      logger.warn({ batch: batch.join(","), errors: errors.slice(-batch.length).map((e) => `${e.provider}:${String(e.error).slice(0, 80)}`) }, "parallel batch failed, trying next batch");
    }
  }
  return { ok: false, errors };
}

export async function tryProviders(opts: TryProvidersOpts): Promise<TryProvidersResult> {
  if (opts.parallel && opts.parallel > 1 && opts.providerOrder.length > 1) {
    return tryProvidersParallel(opts, Math.min(opts.parallel, 5));
  }
  const errors: ProviderError[] = [];
  for (const pid of opts.providerOrder) {
    const provider = providers[pid];
    if (!provider) continue;

    if (isOpen(pid)) {
      errors.push({ provider: pid, error: "circuit open (cooldown)" });
      continue;
    }

    const key = getNextKeyManaged(pid);
    if (key === null) {
      errors.push({ provider: pid, error: `no key configured (set ${pid.toUpperCase().replace(/-/g, "_")}_API_KEYS)` });
      continue;
    }
    if (!key && !isPublicProvider(pid)) {
      errors.push({ provider: pid, error: "missing key" });
      continue;
    }

    if (opts.quotaTokens !== undefined) {
      const quota = await checkQuotaAsync(pid, key, opts.quotaTokens);
      if (!quota.allowed) {
        errors.push({ provider: pid, error: quota.reason, retryAfterMs: quota.retryAfterMs });
        if (quota.retryAfterMs) markRateLimited(pid, key, quota.retryAfterMs);
        continue;
      }
    }

    if (opts.shouldSkip) {
      const reason = opts.shouldSkip(pid);
      if (reason) {
        errors.push({ provider: pid, error: reason });
        continue;
      }
    }

    try {
      // Per-provider fetch timeout — fail fast so next fallback is tried quickly.
      // For streaming, this only times out the initial fetch (headers), not the SSE body.
      // Use opts.timeoutMs if provided (auto uses shorter timeout), else config.providerTimeoutMs (default 25s)
      const callWithTimeout = async () => {
        const timeoutMs = opts.timeoutMs ?? config.providerTimeoutMs;
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`provider timeout after ${timeoutMs}ms — thử model khác hoặc tắt Web Tools (Globe) nếu bật`)), timeoutMs);
          timer.unref?.();
        });
        try {
          const res = await Promise.race([opts.call({ providerId: pid, provider, key }), timeout]);
          return res;
        } finally { if (timer) clearTimeout(timer); }
      };
      const res = await callWithTimeout();
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // 429 carries Retry-After so callers can back off precisely
        let retryAfterMs: number | undefined;
        if (res.status === 429) {
          const retry = parseInt(res.headers.get("retry-after") || "60", 10) * 1000;
          retryAfterMs = Number.isNaN(retry) ? 60000 : retry;
          markRateLimited(pid, key, retryAfterMs);
        }
        errors.push({ provider: pid, status: res.status, error: text.slice(0, 600), retryAfterMs });
        // 4xx (except 429) is a client/request error — not provider fault, don't trip breaker
        recordFailureIfRetryable(pid, res.status);
        continue;
      }
      recordSuccess(pid);
      markSuccess(pid, key);
      if (opts.quotaTokens !== undefined) recordUsage(pid, key, opts.quotaTokens);
      return { ok: true, providerId: pid, key, res };
    } catch (e) {
      const msg = errMessage(e);
      logger.warn({ provider: pid, err: msg }, "provider failed, trying next");
      errors.push({ provider: pid, error: msg });
      recordFailureIfRetryable(pid);
      continue;
    }
  }
  return { ok: false, errors };
}
