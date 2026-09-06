import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve data/*.json path robustly for both dev (tsx from apps/gateway) and prod (node dist)
 * Tries multiple candidates and returns first existing, else fallback to first.
 */
export function resolveDataPath(filename: string): string {
  const candidates: string[] = [];

  // 1. Relative to this file (most reliable) — src/lib/paths.ts -> ../../../../data
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // From src: apps/gateway/src/lib -> ../../.. -> apps/gateway -> ../.. -> repo root
    candidates.push(path.resolve(path.join(__dirname, "../../../data", filename))); // dist/lib or src/lib
    candidates.push(path.resolve(path.join(__dirname, "../../../../data", filename)));
    candidates.push(path.resolve(path.join(__dirname, "../../data", filename)));
    candidates.push(path.resolve(path.join(__dirname, "../../../..", "data", filename)));
  } catch {}

  // 2. cwd relative (when running from repo root)
  candidates.push(path.resolve("data", filename));
  candidates.push(path.resolve(path.join(process.cwd(), "data", filename)));

  // 3. cwd is apps/gateway
  candidates.push(path.resolve(path.join(process.cwd(), "..", "data", filename)));
  candidates.push(path.resolve(path.join(process.cwd(), "../..", "data", filename)));

  // 4. Docker absolute
  candidates.push(path.resolve("/app/data", filename));
  candidates.push(path.join("/app", "data", filename));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  // Fallback to file-relative first (not cwd) to ensure correct location when file doesn't exist yet
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(path.join(__dirname, "../../../data", filename));
  } catch {
    return path.resolve("data", filename);
  }
}

export function readDataJson<T>(filename: string, fallback: T): T {
  try {
    const p = resolveDataPath(filename);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {}
  return fallback;
}
