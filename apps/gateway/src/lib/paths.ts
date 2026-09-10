import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const resolvedPathCache = new Map<string, { path: string; at: number }>();
const PATH_CACHE_TTL_MS = 10000; // re-probe every 10s if file appears/disappears

function buildCandidates(filename: string): string[] {
  const candidates: string[] = [];
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    candidates.push(path.resolve(path.join(__dirname, "../../../data", filename)));
    candidates.push(path.resolve(path.join(__dirname, "../../../../data", filename)));
    candidates.push(path.resolve(path.join(__dirname, "../../data", filename)));
    candidates.push(path.resolve(path.join(__dirname, "../../../..", "data", filename)));
  } catch { /* ignore */ }
  candidates.push(path.resolve("data", filename));
  candidates.push(path.resolve(path.join(process.cwd(), "data", filename)));
  candidates.push(path.resolve(path.join(process.cwd(), "..", "data", filename)));
  candidates.push(path.resolve(path.join(process.cwd(), "../..", "data", filename)));
  candidates.push(path.resolve("/app/data", filename));
  candidates.push(path.join("/app", "data", filename));
  return candidates;
}

function fallbackPath(filename: string): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(path.join(__dirname, "../../../data", filename));
  } catch { return path.resolve("data", filename); }
}

/**
 * Resolve data/*.json path robustly for both dev (tsx from apps/gateway) and prod (node dist)
 * Tries multiple candidates and returns first existing, else fallback to first.
 * Cached with TTL to avoid 10+ existsSync per request (hot path chat: verified/health).
 */
export function resolveDataPath(filename: string): string {
  const cached = resolvedPathCache.get(filename);
  if (cached && Date.now() - cached.at < PATH_CACHE_TTL_MS) {
    // fast path: verify cached still exists before returning (single existsSync instead of 10)
    try { if (fs.existsSync(cached.path)) return cached.path; } catch { /* fall through to re-probe */ }
    // if cached path no longer exists, invalidate and re-probe
    if (Date.now() - cached.at < PATH_CACHE_TTL_MS / 2) return cached.path; // keep fallback for half TTL to avoid thrash
  }
  const candidates = buildCandidates(filename);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { resolvedPathCache.set(filename, { path: p, at: Date.now() }); return p; } } catch { /* ignore */ }
  }
  const fb = fallbackPath(filename);
  resolvedPathCache.set(filename, { path: fb, at: Date.now() });
  return fb;
}

export function readDataJson<T>(filename: string, fallback: T): T {
  try {
    const p = resolveDataPath(filename);
    // single read attempt — no extra existsSync (resolve already checked)
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch { /* ignore: read fallback */ }
  return fallback;
}

export function _resetPathCache(): void { resolvedPathCache.clear(); }
