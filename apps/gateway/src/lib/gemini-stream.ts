import { createOpenAIChunk } from "./format-translator.js";

/**
 * Transform Gemini streamGenerateContent JSON stream to OpenAI SSE.
 * Gemini returns newline-delimited JSON objects: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
 */
export function geminiToOpenAIStream(geminiStream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = geminiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") continue;
            // Remove leading comma/bracket
            const jsonStr = trimmed.replace(/^\[?,\s*/, "").replace(/,$/, "");
            if (!jsonStr || jsonStr === "[" || jsonStr === "]") continue;
            try {
              const obj = JSON.parse(jsonStr);
              const text = obj.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
              if (text) {
                controller.enqueue(encoder.encode(createOpenAIChunk(model, text)));
              }
              // Check finish
              const finish = obj.candidates?.[0]?.finishReason;
              if (finish && finish !== "STOP") {
                // Gemini finishReason like STOP, MAX_TOKENS
              }
            } catch {
              // ignore parse errors for partial chunks
            }
          }
        }
        // Flush buffer
        if (buffer.trim()) {
          try {
            const obj = JSON.parse(buffer.trim().replace(/^\[?,\s*/, ""));
            const text = obj.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
            if (text) controller.enqueue(encoder.encode(createOpenAIChunk(model, text)));
          } catch { /* ignore */ }
        }
        controller.enqueue(encoder.encode(createOpenAIChunk(model, "", "stop")));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}
