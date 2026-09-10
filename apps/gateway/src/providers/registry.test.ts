import { describe, it, expect } from "vitest";
import { resolveProvidersForModel, modelAliases, providerIds } from "./registry.js";

describe("registry resolveProvidersForModel", () => {
  it("prefix model routes to its provider", () => {
    expect(resolveProvidersForModel("groq/llama-3.3-70b-versatile")).toEqual(["groq"]);
    expect(resolveProvidersForModel("kiraai/kira-mini-1.0")).toEqual(["kiraai"]);
  });

  it("explicit aliases win over prefix", () => {
    expect(resolveProvidersForModel("kira-mini-1.0")).toEqual(["kiraai"]);
    expect(resolveProvidersForModel("gpt-4")).toContain("groq");
  });

  it("freellms slug with subpath resolves first segment", () => {
    expect(resolveProvidersForModel("nvidia-nim/z-ai/glm-5.2")).toEqual(["nvidia-nim"]);
  });

  it("unknown model falls back to all providers", () => {
    expect(resolveProvidersForModel("zzz-unknown-model-xyz")).toEqual(providerIds);
  });

  it("free-llm-gateway/auto covers many providers", () => {
    expect(modelAliases["free-llm-gateway/auto"].length).toBeGreaterThan(10);
    expect(modelAliases["free-llm-gateway/auto"]).toContain("b-ai");
    expect(modelAliases["free-llm-gateway/auto"]).toContain("tokenharbor");
    expect(resolveProvidersForModel("auto")).toEqual(providerIds); // bare auto has no alias -> all
  });

  it("lookup is case-insensitive for aliases", () => {
    expect(resolveProvidersForModel("KIRA-MINI-1.0")).toEqual(["kiraai"]);
  });

  it("B.AI and TokenHarbor alias routing", () => {
    expect(resolveProvidersForModel("b-ai/qwen3.8-flash")).toEqual(["b-ai"]);
    expect(resolveProvidersForModel("b-ai/hy3")).toEqual(["b-ai"]);
    expect(resolveProvidersForModel("qwen3.8-flash")).toEqual(["b-ai"]);
    expect(resolveProvidersForModel("hy3")).toEqual(["b-ai"]);
    expect(resolveProvidersForModel("QWEN3.8-FLASH")).toEqual(["b-ai"]);
    expect(resolveProvidersForModel("tokenharbor/deepseek-v4.1-flash:free")).toEqual(["tokenharbor"]);
    expect(resolveProvidersForModel("deepseek-v4.1-flash:free")).toEqual(["tokenharbor"]);
    expect(resolveProvidersForModel("mimo-v2.5:free")).toContain("tokenharbor");
    expect(resolveProvidersForModel("glm-5.3-flash")).toContain("b-ai");
    expect(providerIds).toContain("b-ai");
    expect(providerIds).toContain("tokenharbor");
    expect(providerIds).toContain("bai");
    expect(providerIds).toContain("chat-b-ai");
  });
});
