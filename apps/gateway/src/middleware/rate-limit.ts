import type { MiddlewareHandler } from "hono";
import { isValidVirtualKeyLive } from "../lib/virtual-keys.js";

const windows = new Map<string, { count: number; resetAt: number }>();

export const virtualKeyRateLimit: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  // Skip strict limit for list endpoints (cheap, high frequency on typing/pagination)
  // They use debounced frontend (400ms) but still need higher burst
  const isListEndpoint = path.startsWith("/v1/models") || path.startsWith("/api/providers") || path.startsWith("/api/models/health");
  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const raw = m ? m[1].trim() : "";
  if (!raw) return next();
  const vk = isValidVirtualKeyLive(raw);
  if (!vk) return next(); // will be 401 later
  // RPM check per virtual key — use higher limit for list endpoints (4x)
  const effectiveLimit = isListEndpoint ? Math.max(vk.rpmLimit * 4, 200) : vk.rpmLimit;
  const now = Date.now();
  const key = `vk:${vk.id}:${isListEndpoint ? "list" : "default"}`;
  let w = windows.get(key);
  if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
  if (w.count >= effectiveLimit) {
    return c.json({ error: { message: `Virtual key RPM limit ${effectiveLimit} exceeded`, type: "rate_limit_exceeded", retryAfter: Math.ceil((w.resetAt - now) / 1000) } }, 429);
  }
  w.count++;
  windows.set(key, w);
  c.header("x-ratelimit-limit-requests", String(effectiveLimit));
  c.header("x-ratelimit-remaining-requests", String(Math.max(0, effectiveLimit - w.count)));
  c.header("x-ratelimit-reset", String(Math.ceil(w.resetAt / 1000)));
  await next();
};
