import type { Redis } from "ioredis";
import { getRedis } from "./redis.js";
import { logger } from "../middleware/logger.js";

/**
 * Distributed sliding-window-counter rate limiting (Redis Lua).
 *
 * Blends the current fixed window with a linearly-weighted previous window,
 * approximating a true sliding window without storing per-request timestamps
 * (cf. Kong sliding-window, Redis official howto):
 *
 *   estimated = curCount + prevCount * ((window - elapsed) / window)
 *
 * Deny when estimated + tokens > limit. Increment is explicit so callers can
 * separate check (incr=0) from commit (incr=tokens), mirroring the previous
 * checkQuota/recordUsage split.
 */

export const SLIDING_WINDOW_LUA = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')
local window = tonumber(ARGV[4])
local now = tonumber(ARGV[5])
local into = now % window
local weight = (window - into) / window
local estimated = cur + prev * weight
local limit = tonumber(ARGV[1])
local tokens = tonumber(ARGV[2])
if estimated + tokens > limit then
  return {0, window - into, estimated}
end
local inc = tonumber(ARGV[3])
if inc > 0 then
  redis.call('INCRBY', KEYS[1], inc)
  redis.call('PEXPIRE', KEYS[1], window * 2)
  redis.call('PEXPIRE', KEYS[2], window * 2)
end
return {1, 0, estimated}
`;

let scriptSha: string | null = null;

async function evalSliding(
  r: Redis,
  curKey: string,
  prevKey: string,
  limit: number,
  tokens: number,
  incr: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number; estimated: number }> {
  const now = Date.now();
  const args = [String(limit), String(tokens), String(incr), String(windowMs), String(now)];
  let raw: unknown;
  try {
    if (!scriptSha) {
      scriptSha = (await r.script("LOAD", SLIDING_WINDOW_LUA)) as string;
    }
    raw = await r.evalsha(scriptSha, 2, curKey, prevKey, ...args);
  } catch {
    // NOSCRIPT (failover) or cluster MOVED — fall back to plain EVAL, then to null
    try {
      raw = await r.eval(SLIDING_WINDOW_LUA, 2, curKey, prevKey, ...args);
    } catch (e2) {
      logger.warn({ err: (e2 as Error)?.message || String(e2) }, "[sliding-window] redis eval failed");
      return { allowed: true, retryAfterMs: 0, estimated: 0 }; // fail-open: memory fallback handles it upstream
    }
  }
  const [allowed, retry, estimated] = raw as [number, number, number];
  return { allowed: allowed === 1, retryAfterMs: retry, estimated };
}

export interface SlidingWindowOpts {
  /** key namespace, e.g. `quota:rpm:groq:abcd1234` (window id appended) */
  namespace: string;
  limit: number;
  /** tokens consumed by this request (1 for RPM/RPD, estimated tokens for TPM/TPD) */
  tokens: number;
  /** amount to commit when allowed (0 = check only) */
  incr: number;
  windowMs: number;
  nowMs?: number;
}

function windowKeys(namespace: string, windowMs: number, now: number): { cur: string; prev: string } {
  const id = Math.floor(now / windowMs);
  return { cur: `${namespace}:${id}`, prev: `${namespace}:${id - 1}` };
}

/**
 * Sliding-window check against Redis. Returns null when Redis is unavailable
 * so callers can fall back to the in-memory fixed window.
 */
export async function slidingCheck(opts: SlidingWindowOpts): Promise<{ allowed: boolean; retryAfterMs: number; estimated: number } | null> {
  const r = getRedis();
  if (!r) return null;
  const now = opts.nowMs ?? Date.now();
  const { cur, prev } = windowKeys(opts.namespace, opts.windowMs, now);
  try {
    return await evalSliding(r, cur, prev, opts.limit, opts.tokens, opts.incr, opts.windowMs);
  } catch {
    return null;
  }
}

/** Pure estimator (unit-testable) mirroring the Lua math. */
export function estimateAllowed(cur: number, prev: number, elapsedMs: number, windowMs: number, limit: number, tokens: number): boolean {
  const weight = (windowMs - elapsedMs) / windowMs;
  return cur + prev * weight + tokens <= limit;
}
