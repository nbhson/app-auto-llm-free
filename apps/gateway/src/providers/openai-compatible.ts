import type { Provider, ChatRequest, ModelInfo } from "./base.js";

export function createOpenAICompatibleProvider(opts: {
  id: string;
  baseUrl: string;
  modelsPath?: string;
}): Provider {
  const modelsPath = opts.modelsPath || "/models";
  return {
    id: opts.id,
    type: "openai-compatible",
    async chat(req: ChatRequest, apiKey: string): Promise<Response> {
      const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
      return fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature,
          max_tokens: req.max_tokens,
          stream: req.stream ?? false,
          tools: req.tools,
          tool_choice: req.tool_choice,
          top_p: req.top_p,
        }),
      });
    },
    async models(apiKey?: string): Promise<ModelInfo[]> {
      const url = `${opts.baseUrl.replace(/\/$/, "")}${modelsPath}`;
      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      // Allow no-key for public providers (llm7, huggingface router still needs key but we try)
      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const data: any = await res.json().catch(() => ({}));
      const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
      return list.map((m: any) => ({
        id: `${opts.id}/${m.id || m.name}`,
        provider: opts.id,
        displayName: m.id || m.name,
        ownedBy: opts.id,
      }));
    },
    async health(apiKey: string): Promise<boolean> {
      try {
        const url = `${opts.baseUrl.replace(/\/$/, "")}${modelsPath}`;
        const headers: Record<string, string> = {};
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(url, { headers });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
