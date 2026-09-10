import type { MiddlewareHandler } from "hono";
import pino from "pino";

/** Header/body fields never allowed in logs. */
export const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers['x-api-key']",
  "req.headers.cookie",
  "err.config.headers",
  "headers.Authorization",
  "headers.authorization",
  "headers['x-api-key']",
  "*.Authorization",
  "*.authorization",
];

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = c.req.header("x-request-id") || c.req.header("X-Request-Id") || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  (c as unknown as { set: (k: string, v: string) => void }).set?.("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
  const ms = Date.now() - start;
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms, requestId }, "request");
};
