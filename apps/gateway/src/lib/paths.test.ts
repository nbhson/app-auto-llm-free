import { describe, it, expect } from "vitest";
import { resolveDataPath, readDataJson } from "./paths.js";

describe("paths", () => {
  it("resolveDataPath ends with filename", () => {
    const p = resolveDataPath("whatever.json");
    expect(p.endsWith("whatever.json")).toBe(true);
  });

  it("readDataJson returns fallback for missing file", () => {
    expect(readDataJson("definitely-missing-xyz.json", { a: 1 })).toEqual({ a: 1 });
  });

  it("readDataJson reads existing repo data file", () => {
    const providers = readDataJson<any[]>("freellms-providers.json", []);
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
  });
});
