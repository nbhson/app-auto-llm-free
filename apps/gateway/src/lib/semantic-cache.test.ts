import { describe, it, expect, beforeEach } from "vitest";
import { SemanticCache } from "./semantic-cache.js";

describe("semantic-cache exact match + tenant isolation", () => {
  let cache: SemanticCache;
  beforeEach(() => {
    cache = new SemanticCache(60);
  });

  it("misses on empty cache, hits after set (legacy path)", async () => {
    expect(await cache.get("q1", "model-a")).toBeNull();
    await cache.set("q1", "model-a", "answer-1");
    // legacy set stores composite key; legacy get still resolves via composite? use same-model composite opts
    const hit = await cache.getWithOpts({ model: "model-a", query: "q1", vkId: "anon" });
    // set() uses default {model,query} -> vk anon; getWithOpts anon must hit
    expect(hit).toBe("answer-1");
  });

  it("isolates tenants: different vkId must miss", async () => {
    await cache.setWithOpts({ model: "m", query: "q", vkId: "tenant-1" }, "resp-1");
    expect(await cache.getWithOpts({ model: "m", query: "q", vkId: "tenant-1" })).toBe("resp-1");
    expect(await cache.getWithOpts({ model: "m", query: "q", vkId: "tenant-2" })).toBeNull();
  });

  it("isolates models and tools/temperature variants", async () => {
    await cache.setWithOpts({ model: "m1", query: "q", vkId: "anon" }, "r1");
    expect(await cache.getWithOpts({ model: "m2", query: "q", vkId: "anon" })).toBeNull();
    await cache.setWithOpts({ model: "m", query: "q", tools: [{ f: 1 }], vkId: "anon" }, "r-tools");
    expect(await cache.getWithOpts({ model: "m", query: "q", vkId: "anon" })).toBeNull();
  });

  it("expires entries after TTL", async () => {
    const short = new SemanticCache(0.05); // 50ms
    await short.setWithOpts({ model: "m", query: "q-exp", vkId: "anon" }, "v");
    expect(await short.getWithOpts({ model: "m", query: "q-exp", vkId: "anon" })).toBe("v");
    await new Promise((r) => setTimeout(r, 80));
    expect(await short.getWithOpts({ model: "m", query: "q-exp", vkId: "anon" })).toBeNull();
  });

  it("tracks hits/misses/size and clear resets", async () => {
    await cache.getWithOpts({ model: "m", query: "missing", vkId: "anon" });
    await cache.setWithOpts({ model: "m", query: "present", vkId: "anon" }, "v");
    await cache.getWithOpts({ model: "m", query: "present", vkId: "anon" });
    const stats = await cache.getStats();
    expect(stats.misses).toBeGreaterThanOrEqual(1);
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.hitRate).toBeGreaterThan(0);
    expect(stats.size).toBeGreaterThanOrEqual(1);
    await cache.clear();
    const after = await cache.getStats();
    expect(after.hits).toBe(0);
    expect(after.size).toBe(0);
  });

  it("buildKey differs per tenant (no poisoning)", () => {
    const k1 = cache.buildKey({ model: "m", query: "q", vkId: "a" });
    const k2 = cache.buildKey({ model: "m", query: "q", vkId: "b" });
    expect(k1).not.toBe(k2);
  });
});
