import { describe, it, expect } from "vitest";
import {
  translateOpenAIToGemini,
  translateGeminiToOpenAI,
  createOpenAIChunk,
} from "./format-translator.js";

describe("format-translator OpenAI <-> Gemini", () => {
  it("maps system + user/assistant roles, tools -> functionDeclarations", () => {
    const req: any = {
      model: "gemini-flash",
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
      temperature: 0.5,
      max_tokens: 100,
      top_p: 0.9,
      tools: [{ type: "function", function: { name: "get_time", description: "now", parameters: { type: "object" } } }],
    };
    const g = translateOpenAIToGemini(req);
    expect(g.contents).toHaveLength(2);
    expect(g.contents[0]).toMatchObject({ role: "user" });
    expect(g.contents[1]).toMatchObject({ role: "model" });
    expect(g.systemInstruction?.parts[0].text).toBe("be concise");
    expect(g.tools?.[0].functionDeclarations[0].name).toBe("get_time");
    expect(g.generationConfig).toMatchObject({ temperature: 0.5, maxOutputTokens: 100, topP: 0.9 });
  });

  it("omits systemInstruction/tools when absent", () => {
    const g = translateOpenAIToGemini({ model: "x", messages: [{ role: "user", content: "hi" }] } as any);
    expect(g.systemInstruction).toBeUndefined();
    expect(g.tools).toBeUndefined();
  });

  it("translateGeminiToOpenAI extracts text + usage", () => {
    const data = {
      candidates: [{ content: { parts: [{ text: "hello " }, { text: "world" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7, totalTokenCount: 12 },
    };
    const out = translateGeminiToOpenAI(data, "gemini-flash", "google-gemini/gemini-flash");
    expect(out.choices[0].message.content).toBe("hello world");
    expect(out.choices[0].finish_reason).toBe("stop");
    expect(out.usage).toMatchObject({ prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 });
    expect(out.model).toBe("google-gemini/gemini-flash");
  });

  it("translateGeminiToOpenAI handles empty candidates gracefully", () => {
    const out = translateGeminiToOpenAI({}, "m", "orig");
    expect(out.choices[0].message.content).toBe("");
    expect(out.model).toBe("orig");
  });

  it("createOpenAIChunk emits valid SSE data line", () => {
    const chunk = createOpenAIChunk("test-model", "hello", "stop");
    expect(chunk.startsWith("data: ")).toBe(true);
    expect(chunk.endsWith("\n\n")).toBe(true);
    const payload = JSON.parse(chunk.slice(6));
    expect(payload.model).toBe("test-model");
    expect(payload.choices[0].delta.content).toBe("hello");
    expect(payload.choices[0].finish_reason).toBe("stop");
  });
});
