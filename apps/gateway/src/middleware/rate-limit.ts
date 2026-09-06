import type { MiddlewareHandler } from "hono";
import { isValidVirtualKeyLive } from "../lib/virtual-keys.js";

const windows = new Map<string, { count: number; resetAt: number }>();

export const virtualKeyRateLimit: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const raw = m ? m[1].trim() : "";
  if (!raw) return next();
  const vk = isValidVirtualKeyLive(raw);
  if (!vk) return next(); // will be 401 later
  // RPM check per virtual key
  const now = Date.now();
  const key = `vk:${vk.id}`;
  let w = windows.get(key);
  if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
  if (w.count >= vk.rpmLimit) {
    return c.json({ error: { message: `Virtual key RPM limit ${vk.rpmLimit} exceeded`, type: "rate_limit_exceeded", retryAfter: Math.ceil((w.resetAt - now) / 1000) } }, 429);
  }
  w.count++;
  windows.set(key, w);
  c.header("x-ratelimit-limit-requests", String(vk.rpmLimit));
  c.header("x-ratelimit-remaining-requests", String(Math.max(0, vk.rpmLimit - w.count)));
  c.header("x-ratelimit-reset", String(Math.ceil(w.resetAt / 1000)));
  await next();
};
