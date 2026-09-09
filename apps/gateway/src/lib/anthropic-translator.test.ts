import { describe, it, expect } from "vitest";
import {
  translateOpenAIToAnthropic,
  translateAnthropicToOpenAI,
  anthropicStreamToOpenAIChunk,
} from "./anthropic-translator.js";

describe("anthropic-translator OpenAI -> Anthropic", () => {
  it("extracts system, maps tool role -> tool_result, assistant stays assistant", () => {
    const req: any = {
      model: "claude-3",
      messages: [
        { role: "system", content: "sys1" },
        { role: "system", content: "sys2" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "tool", content: "result", tool_call_id: "call_1" },
      ],
      max_tokens: 50,
    };
    const out = translateOpenAIToAnthropic(req);
    expect(out.system).toBe("sys1\nsys2");
    expect(out.max_tokens).toBe(50);
    expect(out.messages).toHaveLength(3);
    expect(out.messages[0]).toMatchObject({ role: "user" });
    expect(out.messages[1]).toMatchObject({ role: "assistant" });
    expect(out.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "call_1" });
  });

  it("maps image_url parts -> image blocks, tools + tool_choice", () => {
    const req: any = {
      model: "m",
      messages: [{ role: "user", content: [{ type: "text", text: "see" }, { type: "image_url", image_url: { url: "http://x/img.png" } }] }],
      tools: [{ type: "function", function: { name: "fn", description: "d", parameters: { type: "object" } } }],
      tool_choice: { type: "function", function: { name: "fn" } },
      stop: ["END"],
    };
    const out = translateOpenAIToAnthropic(req);
    const content = out.messages[0].content as any[];
    expect(content[0]).toMatchObject({ type: "text", text: "see" });
    expect(content[1]).toMatchObject({ type: "image" });
    expect((out.tools as any[])[0]).toMatchObject({ name: "fn", input_schema: { type: "object" } });
    expect(out.tool_choice).toMatchObject({ type: "tool", name: "fn" });
    expect(out.stop_sequences).toEqual(["END"]);
  });

  it("defaults max_tokens to 4096, maps tool_choice strings", () => {
    const auto = translateOpenAIToAnthropic({ model: "m", messages: [{ role: "user", content: "hi" }], tool_choice: "auto" } as any);
    expect(auto.max_tokens).toBe(4096);
    expect(auto.tool_choice).toMatchObject({ type: "auto" });
    const none = translateOpenAIToAnthropic({ model: "m", messages: [{ role: "user", content: "hi" }], tool_choice: "none" } as any);
    expect(none.tool_choice).toMatchObject({ type: "none" });
  });
});

describe("anthropic-translator Anthropic -> OpenAI", () => {
  it("joins text blocks, maps usage + stop_reason", () => {
    const out = translateAnthropicToOpenAI(
      {
        id: "msg_1",
        content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }, { type: "tool_use", id: "t" }],
        usage: { input_tokens: 3, output_tokens: 5 },
        stop_reason: "end_turn",
      },
      "claude-3"
    );
    expect(out.choices[0].message.content).toBe("hello world");
    expect(out.choices[0].finish_reason).toBe("stop");
    expect(out.usage).toMatchObject({ prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 });
    expect(out.model).toBe("claude-3");
  });

  it("maps tool_use stop_reason -> tool_calls", () => {
    const out = translateAnthropicToOpenAI({ content: [{ type: "text", text: "x" }], stop_reason: "tool_use" }, "m");
    expect(out.choices[0].finish_reason).toBe("tool_calls");
  });
});

describe("anthropic-translator stream", () => {
  it("converts content_block_delta text -> OpenAI chunk", () => {
    const chunks = anthropicStreamToOpenAIChunk({ type: "content_block_delta", delta: { text: "hi" } }, "m");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("hi");
  });

  it("converts message_stop -> finish chunk + [DONE]", () => {
    const chunks = anthropicStreamToOpenAIChunk({ type: "message_stop" }, "m");
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });

  it("ignores message_start/content_block_start and invalid input", () => {
    expect(anthropicStreamToOpenAIChunk({ type: "message_start" }, "m")).toEqual([]);
    expect(anthropicStreamToOpenAIChunk(null as any, "m")).toEqual([]);
    expect(anthropicStreamToOpenAIChunk("str" as any, "m")).toEqual([]);
  });

  it("maps message_delta stop_reason end_turn -> stop", () => {
    const chunks = anthropicStreamToOpenAIChunk({ type: "message_delta", delta: { stop_reason: "end_turn" } }, "m");
    expect(chunks.join("")).toContain("stop");
  });
});
