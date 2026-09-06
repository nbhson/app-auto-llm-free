import type { Provider, ChatRequest, ModelInfo } from "./base.js";

export function createOpenAICompatibleProvider(opts: {
  id: string;
  baseUrl: string;
  modelsPath?: string;
}): Provider {
  const modelsPath = opts.modelsPath || "/models";
  // Resolve templated baseUrl like cloudflare {account_id}
  function resolveBase(): string {
    let base = opts.baseUrl.replace(/\/$/, "");
    if (base.includes("{account_id}")) {
      const acct = process.env.CLOUDFLARE_ACCOUNT_ID || "";
      base = base.replace("{account_id}", acct);
    }
    return base;
  }
  return {
    id: opts.id,
    type: "openai-compatible",
    async chat(req: ChatRequest, apiKey: string): Promise<Response> {
      const base = resolveBase();
      const url = `${base}/chat/completions`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      // Extract model after provider prefix (e.g. nvidia-nim/z-ai/glm-5.2 -> z-ai/glm-5.2)
      const rawModel = req.model.includes("/") ? req.model.split("/").slice(1).join("/") : req.model;
      const model = rawModel || req.model;
      return fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: req.temperature,
          max_tokens: req.max_tokens,
          stream: req.stream ?? false,
          tools: req.tools,
          tool_choice: req.tool_choice,
          top_p: req.top_p,
          top_k: (req as any).top_k,
          n: req.n,
          stop: req.stop,
          presence_penalty: req.presence_penalty,
          frequency_penalty: req.frequency_penalty,
          user: req.user,
        }),
      });
    },
    async models(apiKey?: string): Promise<ModelInfo[]> {
      const base = resolveBase();
      const url = `${base}${modelsPath}`;
      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
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
        const base = resolveBase();
        const url = `${base}${modelsPath}`;
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
