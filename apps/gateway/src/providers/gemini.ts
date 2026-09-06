import type { Provider, ChatRequest, ModelInfo } from "./base.js";
import { translateOpenAIToGemini, translateGeminiToOpenAI } from "../lib/format-translator.js";
import { geminiToOpenAIStream } from "../lib/gemini-stream.js";

function sanitizeGeminiModel(raw: string): string {
  // raw like "gemini/gemini 3.6 flash" or "gemini-2.0-flash" or "auto"
  const base = raw.includes("/") ? raw.split("/").pop()! : raw;
  const cleaned = base.trim().toLowerCase();
  // Map freellms names with spaces to real Gemini ids
  if (cleaned.includes("3.6")) return "gemini-2.0-flash";
  if (cleaned.includes("3.5") && cleaned.includes("lite")) return "gemini-2.0-flash-lite";
  if (cleaned.includes("3.5")) return "gemini-2.0-flash";
  if (cleaned.includes("2.0")) return "gemini-2.0-flash";
  if (cleaned.includes("1.5")) return "gemini-1.5-flash";
  if (cleaned === "auto" || cleaned === "gemini" || cleaned === "gemini-flash") return "gemini-2.0-flash";
  // Keep dash form if looks like gemini-*
  if (cleaned.startsWith("gemini-")) return cleaned.replace(/\s+/g, "-");
  return "gemini-2.0-flash";
}

export const geminiProvider: Provider = {
  id: "gemini",
  type: "gemini",
  async chat(req: ChatRequest, apiKey: string): Promise<Response> {
    const geminiModel = sanitizeGeminiModel(req.model);
    const isStream = req.stream ?? false;
    const endpoint = isStream ? "streamGenerateContent" : "generateContent";
    // alt=sse for true SSE from Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${endpoint}${isStream ? "?alt=sse" : ""}&key=${apiKey}`;

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

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
    if (!res.ok) return res;
    const stream = res.body;
    if (!stream) return res;
    // Transform Gemini SSE JSON to OpenAI SSE
    const ct = res.headers.get("content-type") || "";
    // If Gemini already returns text/event-stream with JSON, transform; else wrap
    const transformed = ct.includes("text/event-stream") || ct.includes("application/json")
      ? geminiToOpenAIStream(stream, req.model)
      : stream;
    return new Response(transformed, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
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
