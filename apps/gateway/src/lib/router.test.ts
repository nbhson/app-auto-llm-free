import { describe, it, expect } from "vitest";
import { isPublicProvider } from "./router.js";

describe("router", () => {
  it("isPublicProvider returns true for pollinations", () => {
    expect(isPublicProvider("pollinations")).toBe(true);
    expect(isPublicProvider("openrouter")).toBe(false);
    expect(isPublicProvider("glhf-chat")).toBe(true);
  });

  it("isPublicProvider returns false for non-public", () => {
    expect(isPublicProvider("openrouter")).toBe(false);
    expect(isPublicProvider("groq")).toBe(false);
  });
});
