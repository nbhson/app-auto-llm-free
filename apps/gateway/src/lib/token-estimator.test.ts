import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessagesTokens, estimateChatTokens } from "./token-estimator.js";

describe("token-estimator", () => {
  it("empty text is 0 tokens", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("scales roughly with length (~len/4 fallback)", () => {
    const short = estimateTokens("abcd");
    const long = estimateTokens("abcd".repeat(100));
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short * 50);
  });

  it("estimateMessagesTokens adds role overhead per message", () => {
    const one = estimateMessagesTokens([{ role: "user", content: "hello" }]);
    const two = estimateMessagesTokens([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
    expect(two).toBeGreaterThan(one);
    // 2 messages add at least 4 tokens overhead each
    expect(two - one).toBeGreaterThanOrEqual(4);
  });

  it("handles array content (multimodal) without throwing", () => {
    const n = estimateMessagesTokens([
      { role: "user", content: [{ type: "text", text: "hi" }] as any },
    ]);
    expect(n).toBeGreaterThan(0);
  });

  it("estimateChatTokens defaults completion to 256 and sums total", () => {
    const r = estimateChatTokens({ messages: [{ role: "user", content: "hello world" }] });
    expect(r.completion).toBe(256);
    expect(r.total).toBe(r.prompt + r.completion);
    const withMax = estimateChatTokens({ messages: [{ role: "user", content: "hi" }], max_tokens: 100 });
    expect(withMax.completion).toBe(100);
  });
});
