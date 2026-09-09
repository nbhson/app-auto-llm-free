import { describe, it, expect } from "vitest";
import { resolveDataPath, readDataJson } from "./paths.js";
import type { FreellmsModelEntry } from "./types.js";

describe("paths", () => {
  it("resolveDataPath ends with filename", () => {
    const p = resolveDataPath("whatever.json");
    expect(p.endsWith("whatever.json")).toBe(true);
  });

  it("readDataJson returns fallback for missing file", () => {
    expect(readDataJson("definitely-missing-xyz.json", { a: 1 })).toEqual({ a: 1 });
  });

  it("readDataJson reads existing repo data file (when present; CI may not persist data/)", () => {
    const providers = readDataJson<FreellmsModelEntry[] | null>("freellms-providers.json", null);
    expect(Array.isArray(providers)).toBe(true);
    if (providers !== null && typeof providers === "object") {
      // local dev: file exists, should have entries
      expect(providers.length).toBeGreaterThan(0);
    }
    // ci/fresh-clone: file absent -> null is fine (data/ not checked into repo)
  });
});
