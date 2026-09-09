import { describe, it, expect } from "vitest";
import { estimateAllowed, slidingCheck } from "./sliding-window.js";

describe("sliding-window estimator (pure math)", () => {
  it("allows under limit", () => {
    expect(estimateAllowed(5, 0, 30_000, 60_000, 10, 1)).toBe(true);
  });

  it("denies over limit", () => {
    expect(estimateAllowed(10, 0, 30_000, 60_000, 10, 1)).toBe(false);
  });

  it("weights previous window by overlap (no boundary spike)", () => {
    // 10 in previous, 0 in current, 1ms into new window -> ~10 counted -> deny
    expect(estimateAllowed(0, 10, 1, 60_000, 10, 1)).toBe(false);
    // 59.999s into window -> previous weight ~0 -> allow
    expect(estimateAllowed(0, 10, 59_999, 60_000, 10, 1)).toBe(true);
  });

  it("accounts token cost for TPM-style dims", () => {
    expect(estimateAllowed(29_000, 0, 30_000, 60_000, 30_000, 500)).toBe(true);
    expect(estimateAllowed(29_000, 0, 30_000, 60_000, 30_000, 2000)).toBe(false);
  });
});

describe("sliding-window redis (adaptive)", () => {
  const ns = `ut-sliding-${Date.now()}`;

  it("allows then denies at limit, or reports unavailable", async () => {
    // limit 3: first 3 commits pass, 4th denied
    for (let i = 0; i < 3; i++) {
      const r = await slidingCheck({ namespace: ns, limit: 3, tokens: 1, incr: 1, windowMs: 60_000 });
      if (r === null) return; // no Redis in this env — fallback path covers behavior
      expect(r.allowed).toBe(true);
    }
    const denied = await slidingCheck({ namespace: ns, limit: 3, tokens: 1, incr: 0, windowMs: 60_000 });
    expect(denied).not.toBeNull();
    expect(denied!.allowed).toBe(false);
    expect(denied!.retryAfterMs).toBeGreaterThan(0);
  });

  it("check-only does not consume budget", async () => {
    const ns2 = `${ns}-checkonly`;
    for (let i = 0; i < 5; i++) {
      const r = await slidingCheck({ namespace: ns2, limit: 3, tokens: 1, incr: 0, windowMs: 60_000 });
      if (r === null) return;
      expect(r.allowed).toBe(true); // never consumes -> always allowed
    }
  });
});
