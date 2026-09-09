import { describe, it, expect } from "vitest";
import { calculateSavings, getCostBreakdown, getAnalytics } from "./analytics.js";
import { addLog } from "./request-log.js";

describe("analytics", () => {
  it("calculateSavings returns hit stats shape", async () => {
    const s = await calculateSavings();
    expect(s).toHaveProperty("cachedRequests");
    expect(s).toHaveProperty("estimatedTokensSaved");
    expect(s).toHaveProperty("estimatedCostSaved");
    expect(s.hitRate).toBeGreaterThanOrEqual(0);
    expect(s.hitRate).toBeLessThanOrEqual(1);
  });

  it("getCostBreakdown aggregates per provider", () => {
    const p = `analytics-prov-${Date.now()}`;
    addLog({ id: "a1", timestamp: new Date().toISOString(), provider: p, model: "m", totalTokens: 100, latencyMs: 10, status: 200 });
    const bd = getCostBreakdown();
    expect(bd[p].tokens).toBeGreaterThanOrEqual(100);
    expect(bd[p].requests).toBeGreaterThanOrEqual(1);
    expect(bd[p].cost).toBeGreaterThanOrEqual(0);
  });

  it("getAnalytics groups by provider/model/key with time buckets", async () => {
    const byProv: any = await getAnalytics({ interval: "day", groupBy: "provider", limit: 10 });
    expect(byProv.totalRequests).toBeGreaterThanOrEqual(0);
    expect(byProv).toHaveProperty("byGroup");
    expect(byProv).toHaveProperty("byTime");
    expect(byProv).toHaveProperty("costBreakdown");
    expect(byProv).toHaveProperty("savings");

    const byModel: any = await getAnalytics({ interval: "hour", groupBy: "model", limit: 10 });
    expect(byModel.interval).toBe("hour");
    const byKey: any = await getAnalytics({ interval: "day", groupBy: "key", limit: 10 });
    expect(byKey.groupBy).toBe("key");
  });
});
