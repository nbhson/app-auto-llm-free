import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";

let client: Redis | null = null;
let initAttempted = false;

/**
 * Lazy singleton Redis client.
 * Returns null when REDIS_URL is empty or connection fails.
 */
export function initRedis(): Redis | null {
  if (client) return client;
  initAttempted = true;

  const url = config.redisUrl?.trim();
  if (!url) {
    logger.warn("[redis] REDIS_URL empty — running without Redis (fallback to in-memory)");
    return null;
  }

  try {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      },
    });

    client.on("connect", () => logger.info("[redis] connecting"));
    client.on("ready", () => logger.info("[redis] ready"));
    client.on("error", (err: Error) => logger.warn({ err: (err as Error).message }, "[redis] connection error"));
    client.on("close", () => logger.warn("[redis] connection closed"));

    // fire-and-forget connect, handle failure gracefully
    client.connect().catch((err: Error) => {
      logger.warn({ err: err.message }, "[redis] initial connect failed — fallback to in-memory");
      // keep client but isRedisAvailable will check status
    });

    return client;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[redis] init failed");
    client = null;
    return null;
  }
}

export function getRedis(): Redis | null {
  if (client) return client;
  if (!initAttempted) return initRedis();
  // already attempted and url was empty / failed
  if (!config.redisUrl?.trim()) return null;
  return client;
}

export function isRedisAvailable(): boolean {
  if (!client) return false;
  // ioredis status: wait | connecting | connect | ready | close | end
  return client.status === "ready" || client.status === "connect";
}

// ---- helpers ----

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, "[redis] GET failed");
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSec?: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    if (ttlSec && ttlSec > 0) await r.set(key, value, "EX", ttlSec);
    else await r.set(key, value);
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, "[redis] SET failed");
  }
}

export async function redisIncrWithExpire(key: string, ttlSec: number): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  try {
    const pipeline = r.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttlSec);
    const results = await pipeline.exec();
    // results: [ [err, incrVal], [err, expireVal] ]
    const val = results?.[0]?.[1] as number | undefined;
    return typeof val === "number" ? val : 0;
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, "[redis] INCR+EXPIRE failed");
    return 0;
  }
}

export function redisPipeline(): ReturnType<Redis["pipeline"]> | null {
  const r = getRedis();
  if (!r) return null;
  try {
    return r.pipeline();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[redis] pipeline creation failed");
    return null;
  }
}
