import { describe, it, expect } from "vitest";
import { geminiToOpenAIStream } from "./gemini-stream.js";

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function geminiStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l + "\n"));
      c.close();
    },
  });
}

describe("gemini-stream", () => {
  it("converts Gemini JSON lines to OpenAI SSE + [DONE]", async () => {
    const text = await collect(
      geminiToOpenAIStream(
        geminiStream([
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "hello " }] } }] }),
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "world" }] } }] }),
        ]),
        "gemini-flash"
      )
    );
    expect(text).toContain("hello ");
    expect(text).toContain("world");
    expect(text).toContain("chat.completion.chunk");
    expect(text).toContain("[DONE]");
  });

  it("skips brackets/commas/empty lines and bad JSON", async () => {
    const text = await collect(geminiToOpenAIStream(geminiStream(["[", ",", "not-json{{{", "]", JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })]), "m"));
    expect(text).toContain("ok");
    expect(text).toContain("[DONE]");
  });

  it("empty stream still terminates with stop + [DONE]", async () => {
    const text = await collect(geminiToOpenAIStream(geminiStream([]), "m"));
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain("[DONE]");
  });
});
