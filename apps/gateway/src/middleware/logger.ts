import type { MiddlewareHandler } from "hono";
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, "request");
};
