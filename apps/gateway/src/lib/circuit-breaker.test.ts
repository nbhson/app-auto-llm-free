import { describe, it, expect } from "vitest";
import { isOpen, recordSuccess, recordFailure, getState } from "./circuit-breaker.js";

describe("circuit-breaker", () => {
  const pid = `test-provider-${Date.now()}`;

  it("starts closed", () => {
    expect(isOpen(pid)).toBe(false);
    expect(getState(pid).state).toBe("closed");
  });

  it("opens after threshold failures", async () => {
    const p2 = `${pid}-open`;
    for (let i = 0; i < 5; i++) recordFailure(p2);
    expect(isOpen(p2)).toBe(true);
    expect(getState(p2).state).toBe("open");
  });

  it("success resets failures", () => {
    const p3 = `${pid}-reset`;
    recordFailure(p3);
    recordSuccess(p3);
    expect(getState(p3).failures).toBe(0);
    expect(isOpen(p3)).toBe(false);
  });
});
