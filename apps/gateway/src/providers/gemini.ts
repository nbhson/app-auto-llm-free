import type { Provider, ChatRequest, ModelInfo } from "./base.js";
import { translateOpenAIToGemini, translateGeminiToOpenAI } from "../lib/format-translator.js";

export const geminiProvider: Provider = {
  id: "gemini",
  type: "gemini",
  async chat(req: ChatRequest, apiKey: string): Promise<Response> {
    // Gemini streaming vs non-streaming uses different endpoint
    const model = req.model.includes("/") ? req.model.split("/").pop()! : req.model;
    const geminiModel = model.replace("gemini/", "") || "gemini-2.0-flash";
    const isStream = req.stream ?? false;
    const endpoint = isStream ? "streamGenerateContent" : "generateContent";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${endpoint}?key=${apiKey}`;

    const geminiBody = translateOpenAIToGemini(req);

    if (!isStream) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
      if (!res.ok) return res;
      const data: any = await res.json();
      const openAI = translateGeminiToOpenAI(data, geminiModel, req.model);
      return new Response(JSON.stringify(openAI), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Streaming: Gemini returns JSON array stream, we convert to SSE
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...geminiBody, generationConfig: { ...geminiBody.generationConfig } }),
    });
    if (!res.ok) return res;

    // For MVP, passthrough with minimal transform — real SSE conversion in P2
    // Return as SSE for gateway to proxy
    const stream = res.body;
    if (!stream) return res;
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  },
  async models(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) return [{ id: "gemini/gemini-2.0-flash", provider: "gemini", contextLength: 1_000_000 }];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) return [{ id: "gemini/gemini-2.0-flash", provider: "gemini" }];
      const data: any = await res.json();
      return (data.models || []).map((m: any) => ({
        id: `gemini/${m.name.replace("models/", "")}`,
        provider: "gemini",
        displayName: m.displayName,
      }));
    } catch {
      return [{ id: "gemini/gemini-2.0-flash", provider: "gemini" }];
    }
  },
  async health(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  },
};
