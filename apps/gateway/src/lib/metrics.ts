/**
 * Prometheus metrics via prom-client — replaces hand-rolled Maps
 * Keeps same public API (incCounter/observeHistogram/setGauge/renderMetrics + metrics.* wrappers)
 */
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

export interface CounterCfg { name: string; help: string; labels: string[]; values: Map<string, number>; }
export interface HistogramCfg { name: string; help: string; labels: string[]; buckets: number[]; counts: Map<string, number[]>; sums: Map<string, number>; }

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Dynamic caches for generic incCounter/observeHistogram/setGauge callers
const counterCache = new Map<string, Counter<string>>();
const histogramCache = new Map<string, Histogram<string>>();
const gaugeCache = new Map<string, Gauge<string>>();

function getOrCreateCounter(name: string, help: string, labelNames: string[]): Counter<string> {
  let c = counterCache.get(name);
  if (!c) {
    c = new Counter({ name, help, labelNames: labelNames as unknown as string[], registers: [registry] });
    counterCache.set(name, c);
  }
  return c;
}
function getOrCreateHistogram(name: string, help: string, labelNames: string[], buckets: number[]): Histogram<string> {
  let h = histogramCache.get(name);
  if (!h) {
    h = new Histogram({ name, help, labelNames: labelNames as unknown as string[], buckets, registers: [registry] });
    histogramCache.set(name, h);
  }
  return h;
}
function getOrCreateGauge(name: string, help: string, labelNames: string[]): Gauge<string> {
  let g = gaugeCache.get(name);
  if (!g) {
    g = new Gauge({ name, help, labelNames: labelNames as unknown as string[], registers: [registry] });
    gaugeCache.set(name, g);
  }
  return g;
}

export function incCounter(name: string, help: string, labelNames: string[], labels: Record<string, string>, delta = 1): void {
  const c = getOrCreateCounter(name, help, labelNames);
  c.inc(labels as unknown as Record<string, string>, delta);
}

export function observeHistogram(name: string, help: string, labelNames: string[], buckets: number[], labels: Record<string, string>, value: number): void {
  const h = getOrCreateHistogram(name, help, labelNames, buckets);
  h.observe(labels as unknown as Record<string, string>, value);
}

export function setGauge(name: string, help: string, labelNames: string[], labels: Record<string, string>, value: number): void {
  const g = getOrCreateGauge(name, help, labelNames);
  g.set(labels as unknown as Record<string, string>, value);
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export function resetMetrics(): void {
  registry.clear();
  counterCache.clear();
  histogramCache.clear();
  gaugeCache.clear();
  // re-collect defaults after clear
  collectDefaultMetrics({ register: registry });
  // re-create well-known metrics
  initWellKnown();
}

// Well-known gateway metrics (pre-created for direct use)
let wellKnown: {
  httpRequestsTotal: Counter<string>;
  llmLatency: Histogram<string>;
  quotaHeadroom: Gauge<string>;
  circuitOpen: Gauge<string>;
  cacheHits: Counter<string>;
  byokKeys: Gauge<string>;
} | null = null;

function initWellKnown() {
  wellKnown = {
    httpRequestsTotal: getOrCreateCounter("gateway_http_requests_total", "Total HTTP requests", ["route", "status", "provider"]),
    llmLatency: getOrCreateHistogram("gateway_llm_latency_ms", "LLM upstream latency", ["provider", "model"], [50, 100, 250, 500, 1000, 2500, 5000, 10000]),
    quotaHeadroom: getOrCreateGauge("gateway_quota_headroom", "Quota headroom 0..1", ["provider", "model"]),
    circuitOpen: getOrCreateGauge("gateway_circuit_breaker_open", "Circuit breaker open 1/0", ["provider"]),
    cacheHits: getOrCreateCounter("gateway_cache_hits_total", "Semantic cache hits", ["result"]),
    byokKeys: getOrCreateGauge("gateway_byok_keys", "BYOK keys per provider", ["provider"]),
  };
}
initWellKnown();

// Convenience wrappers (keep original API stable)
export const metrics = {
  httpRequestsTotal: (route: string, status: string, provider: string) => wellKnown!.httpRequestsTotal.inc({ route, status, provider }),
  llmLatency: (provider: string, model: string, ms: number) => wellKnown!.llmLatency.observe({ provider, model }, ms),
  quotaHeadroom: (provider: string, model: string, v: number) => wellKnown!.quotaHeadroom.set({ provider, model }, v),
  circuitOpen: (provider: string, open: number) => wellKnown!.circuitOpen.set({ provider }, open),
  cacheHits: (hit: string) => wellKnown!.cacheHits.inc({ result: hit }),
  byokKeys: (provider: string, n: number) => wellKnown!.byokKeys.set({ provider }, n),
};
