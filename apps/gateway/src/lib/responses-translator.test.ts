import { describe, it, expect } from "vitest";
import {
  translateResponsesToChat,
  translateChatToResponses,
  createResponsesStreamChunk,
} from "./responses-translator.js";

describe("responses-translator Responses -> Chat", () => {
  it("string input + instructions -> system + user", () => {
    const out = translateResponsesToChat({ model: "m", input: "hello", instructions: "be brief" } as any);
    expect(out.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hello" },
    ]);
    expect(out.model).toBe("m");
  });

  it("array of strings + message objects, unknown role -> user", () => {
    const out = translateResponsesToChat({
      model: "m",
      input: ["a", "b", { role: "assistant", content: "c" }, { role: "weird", content: "d" }],
    } as any);
    expect(out.messages.map((m) => m.role)).toEqual(["user", "user", "assistant", "user"]);
  });

  it("empty array yields placeholder user message", () => {
    const out = translateResponsesToChat({ model: "m", input: [] } as any);
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].role).toBe("user");
  });

  it("object input + max_output_tokens mapping", () => {
    const out = translateResponsesToChat({ model: "m", input: { role: "assistant", content: "x" }, max_output_tokens: 99 } as any);
    expect(out.messages[0]).toMatchObject({ role: "assistant", content: "x" });
    expect(out.max_tokens).toBe(99);
  });

  it("passes through temperature/stream/tools", () => {
    const out = translateResponsesToChat({ model: "m", input: "hi", temperature: 0.2, stream: true, tools: [{ n: 1 }] } as any);
    expect(out).toMatchObject({ temperature: 0.2, stream: true });
    expect(out.tools).toEqual([{ n: 1 }]);
  });
});

describe("responses-translator Chat -> Responses", () => {
  it("maps choices + usage, prefixes chatcmpl- id with resp_", () => {
    const out = translateChatToResponses(
      {
        id: "chatcmpl-123",
        model: "prov/m",
        choices: [{ message: { content: "hello" } }],
        usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
      },
      "fallback-model"
    );
    expect(out.id).toBe("resp_123");
    expect(out.object).toBe("response");
    expect(out.status).toBe("completed");
    expect(out.output[0].content[0]).toMatchObject({ type: "output_text", text: "hello" });
    expect(out.usage).toMatchObject({ input_tokens: 5, output_tokens: 6, total_tokens: 11 });
  });

  it("handles array content + missing usage/id", () => {
    const out = translateChatToResponses({ choices: [{ message: { content: [{ text: "a" }, { text: "b" }] } }] }, "m");
    expect(out.output[0].content[0].text).toBe("ab");
    expect(out.usage).toBeUndefined();
    expect(out.id.startsWith("resp_")).toBe(true);
    expect(out.model).toBe("m");
  });
});

describe("responses-translator stream chunk", () => {
  it("delta chunk carries text, done chunk ends with [DONE]", () => {
    const d = createResponsesStreamChunk("m", "tok", false);
    expect(d).toContain("response.output_text.delta");
    expect(d).toContain("tok");
    const done = createResponsesStreamChunk("m", "", true);
    expect(done).toContain("response.completed");
    expect(done).toContain("[DONE]");
  });
});
