import type { ChatRequest } from "../providers/base.js";

interface OpenAIToolDef {
  function?: { name?: string; description?: string; parameters?: unknown };
  name?: string;
  description?: string;
}

interface GeminiPart {
  text?: unknown;
}

// OpenAI -> Gemini (with tools support)
export function translateOpenAIToGemini(req: ChatRequest) {
  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
    }));

  const systemInstruction = req.messages.find((m) => m.role === "system");

  // Tools -> Gemini functionDeclarations
  let tools: Array<{ functionDeclarations: Array<{ name?: string; description?: string; parameters?: unknown }> }> | undefined = undefined;
  if (req.tools && Array.isArray(req.tools) && req.tools.length > 0) {
    const fns = (req.tools as OpenAIToolDef[])
      .map((t) => t.function || t)
      .filter(Boolean)
      .map((fn) => ({
        name: fn.name,
        description: fn.description || "",
        parameters: (fn as { parameters?: unknown }).parameters,
      }));
    if (fns.length > 0) tools = [{ functionDeclarations: fns }];
  }

  return {
    contents,
    systemInstruction: systemInstruction
      ? { parts: [{ text: typeof systemInstruction.content === "string" ? systemInstruction.content : "" }] }
      : undefined,
    tools,
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.max_tokens,
      topP: req.top_p,
    },
  };
}

// Create OpenAI SSE chunk from text delta
export function createOpenAIChunk(model: string, content: string, finish?: string) {
  return `data: ${JSON.stringify({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: finish || null }],
  })}\n\n`;
}

// Gemini -> OpenAI
export function translateGeminiToOpenAI(data: unknown, geminiModel: string, originalModel: string) {
  const root = (data ?? {}) as { candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
  const candidate = root.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => String(p.text ?? "")).join("") || "";
  const usage = root.usageMetadata || {};
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: originalModel || `gemini/${geminiModel}`,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: candidate?.finishReason === "STOP" ? "stop" : candidate?.finishReason?.toLowerCase() || "stop",
      },
    ],
    usage: {
      prompt_tokens: usage.promptTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || 0,
      total_tokens: usage.totalTokenCount || 0,
    },
  };
}
