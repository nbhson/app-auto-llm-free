import { describe, it, expect } from "vitest";
import { hasScope, type VirtualKey } from "./virtual-keys.js";

function vk(scopes: { models: string[]; providers: string[] }, role: "user" | "admin" = "user"): VirtualKey {
  return {
    id: "vk-test",
    name: "test",
    prefix: "fgk-",
    hash: "x",
    scopes,
    rpmLimit: 60,
    tpdLimit: 100000,
    role,
    createdAt: new Date().toISOString(),
  };
}

describe("virtual-keys hasScope", () => {
  it("admin bypasses scope", () => {
    expect(hasScope(vk({ models: [], providers: [] }, "admin"), "anything", "any-provider")).toBe(true);
  });

  it("wildcard allows all", () => {
    expect(hasScope(vk({ models: ["*"], providers: ["*"] }), "gpt-4", "groq")).toBe(true);
  });

  it("denies unlisted model/provider", () => {
    const k = vk({ models: ["groq/llama"], providers: ["groq"] });
    expect(hasScope(k, "openrouter/auto", undefined)).toBe(false);
    expect(hasScope(k, undefined, "openrouter")).toBe(false);
    expect(hasScope(k, "groq/llama-3.3", "groq")).toBe(true);
  });
});
