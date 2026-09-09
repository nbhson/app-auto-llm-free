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

  it("readDataJson returns fallback when file is absent (CI/fresh clone)", () => {
    // data/freellms-providers.json is gitignored — CI clones fresh without it
    const providers = readDataJson<FreellmsModelEntry[] | null>("freellms-providers.json", null);
    expect(providers).toBeNull();
  });
});
