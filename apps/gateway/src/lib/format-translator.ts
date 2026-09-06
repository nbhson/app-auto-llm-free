import type { ChatRequest } from "../providers/base.js";

// OpenAI -> Gemini
export function translateOpenAIToGemini(req: ChatRequest) {
  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
    }));

  const systemInstruction = req.messages.find((m) => m.role === "system");
  return {
    contents,
    systemInstruction: systemInstruction
      ? { parts: [{ text: typeof systemInstruction.content === "string" ? systemInstruction.content : "" }] }
      : undefined,
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.max_tokens,
      topP: req.top_p,
    },
  };
}

// Gemini -> OpenAI
export function translateGeminiToOpenAI(data: any, geminiModel: string, originalModel: string) {
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: any) => p.text).join("") || "";
  const usage = data.usageMetadata || {};
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
