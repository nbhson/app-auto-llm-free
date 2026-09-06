import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./paths.js";

export interface RequestLog {
  id: string;
  timestamp: string;
  virtualKeyId?: string;
  virtualKeyName?: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  status: number;
  error?: string;
  verifiedStatus?: string;
}

const LOG_PATH = resolveDataPath("request-log.json");
const MAX_LOGS = 1000;
let logs: RequestLog[] = [];

function load() {
  try {
    if (fs.existsSync(LOG_PATH)) logs = JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
  } catch { logs = []; }
}

let loaded = false;
function ensure() {
  if (!loaded) { load(); loaded = true; }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    // keep last 1000
    const toSave = logs.slice(-MAX_LOGS);
    fs.writeFileSync(LOG_PATH, JSON.stringify(toSave, null, 2));
  } catch {}
}

// Simple SSE listeners
const listeners = new Set<(log: RequestLog) => void>();

export function addLog(entry: RequestLog) {
  ensure();
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
  persist();
  for (const fn of listeners) try { fn(entry); } catch {}
}

export function getLogs(limit = 100, offset = 0): RequestLog[] {
  ensure();
  return logs.slice(-limit - offset, logs.length - offset).reverse();
}

export function getStats() {
  ensure();
  const last100 = logs.slice(-100);
  const byProvider = new Map<string, number>();
  const tokensByProvider = new Map<string, number>();
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const l of last100) {
    byProvider.set(l.provider, (byProvider.get(l.provider) || 0) + 1);
    const t = l.totalTokens || 0;
    const pt = l.promptTokens || 0;
    const ct = l.completionTokens || 0;
    totalTokens += t;
    promptTokens += pt;
    completionTokens += ct;
    tokensByProvider.set(l.provider, (tokensByProvider.get(l.provider) || 0) + t);
  }
  // All-time tokens
  let allTimeTokens = 0;
  for (const l of logs) allTimeTokens += l.totalTokens || 0;
  const avgLatency = last100.length ? Math.round(last100.reduce((a, b) => a + b.latencyMs, 0) / last100.length) : 0;
  const avgTokens = last100.length ? Math.round(totalTokens / last100.length) : 0;
  const errors = last100.filter((l) => l.status >= 400).length;
  return {
    total: logs.length,
    last100,
    byProvider: Object.fromEntries(byProvider),
    tokensByProvider: Object.fromEntries(tokensByProvider),
    totalTokens,
    promptTokens,
    completionTokens,
    allTimeTokens,
    avgTokens,
    avgLatencyMs: avgLatency,
    errorRate: last100.length ? errors / last100.length : 0,
  };
}

export function onLog(fn: (log: RequestLog) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
