import { describe, it, expect } from "vitest";
import { rankProvidersByCostAndLatency, FREELLMS_COST } from "./cost-router.js";

describe("cost-router", () => {
  it("ranks cheapest first", () => {
    const ranked = rankProvidersByCostAndLatency(["groq", "openrouter", "pollinations"]);
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
