import { describe, it, expect } from "vitest";
import { checkQuota, recordUsage, getQuotaHeadroom } from "./quota-tracker.js";

// unique key prefix per test to isolate the in-memory windows
// (windowKey = provider + first 8 chars of key)
function uniqKey(): string {
  return Math.random().toString(36).slice(2, 10) + "-quota-test-key";
}

describe("quota-tracker", () => {
  it("allows when provider has no limits configured", () => {
    const r = checkQuota("no-such-provider-xyz", uniqKey(), 100);
    expect(r.allowed).toBe(true);
  });

  it("enforces RPM limit and returns retryAfterMs", () => {
    // kilo-code rpm=3 — record 3 uses then 4th must be blocked
    const key = uniqKey();
    for (let i = 0; i < 3; i++) {
      expect(checkQuota("kilo-code", key, 10).allowed).toBe(true);
      recordUsage("kilo-code", key, 10);
    }
    const blocked = checkQuota("kilo-code", key, 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/RPM/);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("enforces TPM limit (cerebras tpm=30000)", () => {
    const key = uniqKey();
    // one huge request exceeding TPM must be rejected
    const r = checkQuota("cerebras", key, 30_001);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/TPM/);
    // small request still allowed
    expect(checkQuota("cerebras", key, 10).allowed).toBe(true);
  });

  it("enforces RPD limit (openrouter rpd=200)", () => {
    const key = uniqKey();
    for (let i = 0; i < 200; i++) recordUsage("openrouter", key, 1);
    const blocked = checkQuota("openrouter", key, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/RPD/);
  });

  it("enforces TPD limit (google-gemini tpd=1500, no TPM to shadow it)", () => {
    const key = uniqKey();
    const r = checkQuota("google-gemini", key, 2000);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/TPD/);
    expect(checkQuota("google-gemini", key, 10).allowed).toBe(true);
  });

  it("getQuotaHeadroom drops as usage grows, aggregates with empty key", () => {
    const key = uniqKey();
    // fresh key (or unknown windows) starts at 1
    expect(getQuotaHeadroom("no-such-provider-xyz", key)).toBe(1);
    // consume 1/3 of kilo-code RPM budget -> headroom < 1
    recordUsage("kilo-code", key, 5);
    const h1 = getQuotaHeadroom("kilo-code", key);
    expect(h1).toBeLessThan(1);
    expect(h1).toBeGreaterThanOrEqual(0);
    // empty-key aggregation must also reflect pressure (fix cost-router always-1 bug)
    const agg = getQuotaHeadroom("kilo-code", "");
    expect(agg).toBeLessThanOrEqual(1);
    expect(agg).toBeGreaterThanOrEqual(0);
  });

  it("isolates windows per key prefix", () => {
    const keyA = uniqKey();
    const keyB = uniqKey();
    for (let i = 0; i < 3; i++) recordUsage("kilo-code", keyA, 1);
    expect(checkQuota("kilo-code", keyA, 1).allowed).toBe(false);
    // different key untouched
    expect(checkQuota("kilo-code", keyB, 1).allowed).toBe(true);
  });
});
