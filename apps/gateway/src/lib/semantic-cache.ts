import crypto from "node:crypto";
import { getRedis } from "./redis.js";
import { logger } from "../middleware/logger.js";
import { config } from "../config.js";

type CacheEntry = { value: string; expiresAt: number; embedding?: number[] };

export class SemanticCache {
  private mem = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private defaultTtl: number;

  constructor(defaultTtlSec = 3600) {
    this.defaultTtl = defaultTtlSec;
  }

  private hash(query: string): string {
    return crypto.createHash("sha256").update(query).digest("hex").slice(0, 32);
  }

  private key(query: string, model: string): string {
    return `semantic:${model}:${this.hash(query)}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  async get(query: string, model: string): Promise<string | null> {
    const k = this.key(query, model);
    // 1) exact hash fast path (Redis + mem)
    try {
      const r = getRedis();
      if (r) {
        const val = await r.get(k);
        if (val !== null) {
          this.hits++;
          return val;
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[semantic-cache] redis get failed");
    }

    const entry = this.mem.get(k);
    if (entry) {
      if (this.isExpired(entry)) {
        this.mem.delete(k);
      } else {
        this.hits++;
        return entry.value;
      }
    }

    // 2) semantic cosine fallback (only if enabled and embedding reachable)
    // Try to embed query and scan mem for nearest > threshold. Redis vector scan skipped for simplicity (fallback to exact).
    if (config.semanticCacheEnabled) {
      try {
        const { embedWithFallback, cosineSimilarity } = await import("./embeddings.js");
        const qEmb = await embedWithFallback(query);
        if (qEmb) {
          let best: { key: string; entry: CacheEntry; score: number } | null = null;
          for (const [memKey, memEntry] of this.mem.entries()) {
            if (this.isExpired(memEntry) || !memEntry.embedding) continue;
            // only consider same model prefix to avoid cross-model pollution
            if (!memKey.startsWith(`semantic:${model}:`) && !memKey.startsWith(`semantic:`)) continue;
            const sim = cosineSimilarity(qEmb.embedding, memEntry.embedding);
            if (sim >= config.semanticCacheThreshold && (!best || sim > best.score)) {
              best = { key: memKey, entry: memEntry, score: sim };
            }
          }
          if (best) {
            logger.info({ score: best.score.toFixed(3), threshold: config.semanticCacheThreshold }, "[semantic-cache] cosine hit");
            this.hits++;
            return best.entry.value;
          }
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[semantic-cache] cosine scan failed, fallback to miss");
      }
    }

    this.misses++;
    return null;
  }

  async set(query: string, model: string, response: string, ttl?: number): Promise<void> {
    const k = this.key(query, model);
    const ttlSec = ttl ?? this.defaultTtl;
    const expiresAt = Date.now() + ttlSec * 1000;

    // try Redis (store string; embedding stored only in mem for cosine scan)
    try {
      const r = getRedis();
      if (r) {
        await r.set(k, response, "EX", ttlSec);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[semantic-cache] redis set failed");
    }

    let embedding: number[] | undefined;
    if (config.semanticCacheEnabled) {
      try {
        const { embedWithFallback } = await import("./embeddings.js");
        const res = await embedWithFallback(query);
        if (res) embedding = res.embedding;
      } catch {}
    }

    this.mem.set(k, { value: response, expiresAt, embedding });
    // opportunistic cleanup of expired entries (every 100 sets)
    if (this.mem.size % 100 === 0) this.sweep();
  }

  async getStats(): Promise<{ hits: number; misses: number; hitRate: number }> {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(3)),
    };
  }

  async clear(): Promise<void> {
    this.mem.clear();
    this.hits = 0;
    this.misses = 0;
    try {
      const r = getRedis();
      if (r) {
        // scan and delete semantic:* - avoid KEYS blocking fallback to scan
        let cursor = "0";
        do {
          const [next, keys] = await r.scan(cursor, "MATCH", "semantic:*", "COUNT", 100);
          cursor = next;
          if (keys.length > 0) await r.del(...keys);
        } while (cursor !== "0");
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[semantic-cache] clear redis failed");
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.mem.entries()) {
      if (now > v.expiresAt) this.mem.delete(k);
    }
  }
}

// default export instance for convenience
export const semanticCache = new SemanticCache();
