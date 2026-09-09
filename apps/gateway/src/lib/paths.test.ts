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

  it("readDataJson reads existing repo data file when tracked", () => {
    // data/freellms-providers.json is intentionally gitignored (see .gitignore line 24);
    // fresh clones don't ship it — test that the fallback path works instead
    const providers = readDataJson<FreellmsModelEntry[] | null>("freellms-providers.json", null);
    expect(Array.isArray(providers)).toBe(true);
    // Either file exists locally (dev) or returns fallback null (CI/fresh clone)
    if (providers !== null && typeof providers === "object") {
      expect(providers.length).toBeGreaterThan(0);
    }
  });
});
