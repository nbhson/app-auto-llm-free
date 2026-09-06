import { config } from "../config.js";

// Timing-safe compare
export function timingSafeEqual(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  let result = lenA === lenB ? 0 : 1;
  const max = Math.max(lenA, lenB);
  for (let i = 0; i < max; i++) {
    const ca = i < lenA ? a.charCodeAt(i) : 0;
    const cb = i < lenB ? b.charCodeAt(i) : 0;
    result |= ca ^ cb;
  }
  return result === 0;
}

export function isValidMasterKey(key: string): boolean {
  return timingSafeEqual(key, config.masterKey);
}

export function extractBearer(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const auth = c.req.header("authorization") || c.req.header("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Virtual keys will be DB-backed in P4; for P1 we accept MASTER_KEY and any fgk-* if master is prefix
export function isValidVirtualKey(key: string): boolean {
  if (isValidMasterKey(key)) return true;
  // P1 permissive: allow any fgk- key if no DB yet (dev mode)
  if (config.nodeEnv === "development" && key.startsWith("fgk-")) return true;
  return false;
}
