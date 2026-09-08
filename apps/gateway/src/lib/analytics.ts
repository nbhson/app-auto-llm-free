import { getLogs, getStats } from "./request-log.js";
import { FREELLMS_COST } from "./cost-router.js";
import { semanticCache } from "./semantic-cache.js";

export interface AnalyticsOpts {
  interval: "hour" | "day";
  groupBy: "provider" | "key" | "model";
  limit?: number;
}

function bucketKey(ts: string, interval: "hour" | "day"): string {
  const d = new Date(ts);
  if (interval === "hour") return d.toISOString().slice(0, 13) + ":00:00.000Z";
  return d.toISOString().slice(0, 10);
}

function costFor(provider: string, tokens: number): number {
  const per1M = FREELLMS_COST[provider] ?? 0.05;
  return (tokens / 1_000_000) * per1M;
}

export async function calculateSavings(): Promise<{ cachedRequests: number; estimatedTokensSaved: number; estimatedCostSaved: number; hitRate: number }> {
  const cacheStats = await semanticCache.getStats().catch(() => ({ hits: 0, misses: 0, hitRate: 0 }));
  const { last100 } = getStats();
  const avgTokens = last100.length ? Math.round(last100.reduce((a, b) => a + (b.totalTokens || 0), 0) / last100.length) : 0;
  const estimatedTokensSaved = cacheStats.hits * avgTokens;
  // avg cost per token across providers
  const avgCostPer1M = Object.values(FREELLMS_COST).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(FREELLMS_COST).length) || 0.05;
  const estimatedCostSaved = (estimatedTokensSaved / 1_000_000) * avgCostPer1M;
  return {
    cachedRequests: cacheStats.hits,
    estimatedTokensSaved,
    estimatedCostSaved: Number(estimatedCostSaved.toFixed(6)),
    hitRate: cacheStats.hitRate,
  };
}

export function getCostBreakdown(): Record<string, { tokens: number; cost: number; requests: number }> {
  const logs = getLogs(1000);
  const map = new Map<string, { tokens: number; cost: number; requests: number }>();
  for (const l of logs) {
    const cur = map.get(l.provider) ?? { tokens: 0, cost: 0, requests: 0 };
    cur.tokens += l.totalTokens || 0;
    cur.requests += 1;
    map.set(l.provider, cur);
  }
  for (const [provider, v] of map.entries()) {
    v.cost = Number(costFor(provider, v.tokens).toFixed(6));
  }
  return Object.fromEntries(map.entries());
}

export async function getAnalytics(opts: AnalyticsOpts): Promise<any> {
  const limit = opts.limit ?? 100;
  const logs = getLogs(limit);
  const stats = getStats();

  // groupBy aggregation
  const groups = new Map<string, { count: number; tokens: number; cost: number; avgLatency: number; latencies: number[] }>();
  const buckets = new Map<string, number>();

  for (const l of logs) {
    const groupKey =
      opts.groupBy === "provider" ? l.provider : opts.groupBy === "model" ? l.model : l.virtualKeyName || l.virtualKeyId || "unknown";
    const g = groups.get(groupKey) ?? { count: 0, tokens: 0, cost: 0, avgLatency: 0, latencies: [] };
    g.count++;
    g.tokens += l.totalTokens || 0;
    g.latencies.push(l.latencyMs);
    groups.set(groupKey, g);

    const b = bucketKey(l.timestamp, opts.interval);
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }

  // finalize avgLatency and cost
  for (const [k, g] of groups.entries()) {
    g.avgLatency = g.latencies.length ? Math.round(g.latencies.reduce((a, b) => a + b, 0) / g.latencies.length) : 0;
    // assume provider grouping for cost, else 0
    const costProvider = opts.groupBy === "provider" ? k : "";
    g.cost = costProvider ? Number(costFor(costProvider, g.tokens).toFixed(6)) : 0;
    (g as any).latencies = undefined;
  }

  const costBreakdown = getCostBreakdown();
  const savings = await calculateSavings();

  // total cost across breakdown
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b.cost, 0);
  const totalTokens = Object.values(costBreakdown).reduce((a, b) => a + b.tokens, 0);

  return {
    interval: opts.interval,
    groupBy: opts.groupBy,
    totalRequests: logs.length,
    totalTokens,
    totalCost: Number(totalCost.toFixed(6)),
    avgLatencyMs: stats.avgLatencyMs,
    errorRate: stats.errorRate,
    byGroup: Object.fromEntries(groups.entries()),
    byTime: Object.fromEntries(buckets.entries()),
    costBreakdown,
    savings,
  };
}
