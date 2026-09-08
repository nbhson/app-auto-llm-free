import { describe, it, expect } from "vitest";
import { sanitizeFreellmsName } from "./sanitize.js";

describe("sanitizeFreellmsName", () => {
  it("leaves valid ids untouched", () => {
    expect(sanitizeFreellmsName("nvidia/nemotron-3-ultra-550b-a55b")).toBe("nvidia/nemotron-3-ultra-550b-a55b");
    expect(sanitizeFreellmsName("pollinations/openai")).toBe("pollinations/openai");
  });

  it("sanitizes freellms names with spaces and free tag", () => {
    expect(sanitizeFreellmsName("google: gemma 4 31b (free)")).toBe("google/gemma-4-31b:free");
    expect(sanitizeFreellmsName("nvidia: nemotron 3 ultra (free)")).toBe("nvidia/nemotron-3-ultra:free");
  });

  it("handles already sanitized :free", () => {
    expect(sanitizeFreellmsName("z-ai/glm-5.2:free")).toBe("z-ai/glm-5.2:free");
  });

  it("normalizes slashes and dashes", () => {
    expect(sanitizeFreellmsName("a :  b / c (free)")).toBe("a/b/c:free");
  });
});
