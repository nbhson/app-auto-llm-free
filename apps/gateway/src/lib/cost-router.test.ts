import { describe, it, expect } from "vitest";
import { rankProvidersByCostAndLatency, FREELLMS_COST } from "./cost-router.js";

describe("cost-router", () => {
  // successWeight: 0 isolates cost ordering from ambient request-log state
  // (success-rate demotion is covered separately in cost-router-async.test.ts)
  it("ranks cheapest first", () => {
    const ranked = rankProvidersByCostAndLatency(["groq", "openrouter", "pollinations"], { successWeight: 0 });
    // pollinations cost 0 should be first or near first
    expect(ranked[0]).toBe("pollinations");
    expect(FREELLMS_COST["pollinations"]).toBe(0);
  });

  it("handles unknown provider with default cost", () => {
    const ranked = rankProvidersByCostAndLatency(["unknown-xyz", "pollinations"]);
    expect(ranked).toContain("pollinations");
    expect(ranked).toContain("unknown-xyz");
  });
});
