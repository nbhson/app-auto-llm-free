import { describe, it, expect } from "vitest";
import { cosineSimilarity, getFallbackModels } from "./embeddings.js";

describe("embeddings cosineSimilarity", () => {
  it("identical vectors score 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("orthogonal vectors score 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("opposite vectors score -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("mismatched length or empty or zero vectors score 0", () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("embeddings fallback chain", () => {
  it("returns ordered deduped model list with primary first", () => {
    const models = getFallbackModels();
    expect(models.length).toBeGreaterThan(0);
    // primary from config default is cohere
    expect(models[0]).toContain("cohere");
    expect(new Set(models).size).toBe(models.length);
  });
});
