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

export function isValidVirtualKey(key: string): boolean {
  if (isValidMasterKey(key)) return true;
  // Strict: no dev fallback. Use virtual-keys store via isValidVirtualKeyLive for fgk-* validation.
  return false;
}
