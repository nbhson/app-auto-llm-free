import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rankProvidersByCostAndLatencyAsync,
  scoreProviders,
  scoreProvidersAsync,
  syncPricing,
  FREELLMS_COST,
} from "./cost-router.js";

describe("cost-router async + scoring", () => {
  it("async rank keeps cheapest first", async () => {
    const ranked = await rankProvidersByCostAndLatencyAsync(["groq", "openrouter", "pollinations"]);
    expect(ranked[0]).toBe("pollinations");
  });

  it("scoreProviders returns sorted scores with headroom", () => {
    const scores = scoreProviders(["groq", "pollinations"]);
    expect(scores).toHaveLength(2);
    expect(scores[0].score).toBeLessThanOrEqual(scores[1].score);
    for (const s of scores) {
      expect(s).toHaveProperty("cost");
      expect(s).toHaveProperty("latency");
      expect(s).toHaveProperty("quotaHeadroom");
    }
  });

  it("scoreProvidersAsync matches sync order", async () => {
    const ids = ["groq", "pollinations", "openrouter"];
    const syncOrder = scoreProviders(ids).map((s) => s.provider);
    const asyncOrder = (await scoreProvidersAsync(ids)).map((s) => s.provider);
    expect(asyncOrder).toEqual(syncOrder);
  });
});

describe("cost-router syncPricing (mocked CDN)", () => {
  const origGroq = FREELLMS_COST["groq"];
  afterEach(() => {
    vi.unstubAllGlobals();
    FREELLMS_COST["groq"] = origGroq;
  });

  it("merges per-token pricing and cools down second call", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ "groq/llama": { input_cost_per_token: 0.0000002 } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = await syncPricing();
    // 0.0000002 * 1M = 0.2
    expect(first["groq"]).toBeCloseTo(0.2, 6);
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await syncPricing();
    expect(second["groq"]).toBeCloseTo(0.2, 6);
    // cooldown: no additional fetch
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("falls back to hardcoded on CDN failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    const costs = await syncPricing();
    expect(costs["pollinations"]).toBe(0);
  });
});
