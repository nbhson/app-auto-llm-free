import { config } from "../config.js";
import { logger } from "../middleware/logger.js";

type State = "closed" | "open" | "half-open";
type Entry = { failures: number; state: State; openedAt: number; successes: number };

const breakers = new Map<string, Entry>();

function get(providerId: string): Entry {
  if (!breakers.has(providerId)) breakers.set(providerId, { failures: 0, state: "closed", openedAt: 0, successes: 0 });
  return breakers.get(providerId)!;
}

export function recordSuccess(providerId: string) {
  const e = get(providerId);
  e.failures = 0;
  e.successes++;
  if (e.state === "half-open" && e.successes >= 2) {
    e.state = "closed";
    logger.info({ provider: providerId }, "circuit closed (half-open success)");
  } else if (e.state === "open") {
    // shouldn't happen, but reset
    e.state = "closed";
  }
}

export function recordFailure(providerId: string) {
  const e = get(providerId);
  e.failures++;
  e.successes = 0;
  if (e.state === "closed" && e.failures >= config.circuitBreakerThreshold) {
    e.state = "open";
    e.openedAt = Date.now();
    logger.warn({ provider: providerId, failures: e.failures }, "circuit opened");
  } else if (e.state === "half-open") {
    e.state = "open";
    e.openedAt = Date.now();
    logger.warn({ provider: providerId }, "circuit re-opened from half-open");
  }
}

/**
 * Count a failure only when it indicates provider trouble: network exception
 * (status undefined), 429, or 5xx. Plain 4xx means the request itself was bad
 * (wrong model, bad params) — retrying another provider won't help, and the
 * breaker must not trip on our own mistakes.
 */
export function recordFailureIfRetryable(providerId: string, status?: number): void {
  if (status !== undefined && status !== 429 && status < 500) return;
  recordFailure(providerId);
}

export function isOpen(providerId: string): boolean {
  const e = get(providerId);
  if (e.state === "closed") return false;
  if (e.state === "open") {
    const elapsed = Date.now() - e.openedAt;
    if (elapsed >= config.circuitBreakerCooldownMs) {
      e.state = "half-open";
      e.successes = 0;
      logger.info({ provider: providerId }, "circuit half-open (cooldown expired)");
      return false; // allow one trial
    }
    return true;
  }
  // half-open: allow trial
  return false;
}

export function getState(providerId: string) {
  return get(providerId);
}

export function getAllStates() {
  return Object.fromEntries(breakers.entries());
}
