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
      let rawModel = req.model.includes("/") ? req.model.split("/").slice(1).join("/") : req.model;
      rawModel = rawModel || req.model;
      // Sanitize freellms names with spaces/parens: "nvidia: nemotron 3 ultra (free)" -> "nvidia/nemotron-3-ultra:free"
      // Do NOT touch already-valid ids containing :free without spaces
      if (/[\s()]/.test(rawModel) && !rawModel.startsWith("@cf/")) {
        const hasFree = /\(free\)|\:free/i.test(rawModel);
        let sanitized = rawModel.toLowerCase();
        sanitized = sanitized.replace(/\s*:\s*/g, "/").replace(/\s*\/\s*/g, "/"); // "nvidia: xxx" -> "nvidia/xxx"
        sanitized = sanitized.replace(/\s+/g, "-");
        sanitized = sanitized.replace(/[()]/g, "");
        sanitized = sanitized.replace(/--+/g, "-");
        sanitized = sanitized.replace(/\/-+/g, "/").replace(/-\//g, "/");
        if (hasFree && !sanitized.includes(":free")) {
          sanitized = sanitized.replace(/-free$/, ":free");
          if (!sanitized.includes(":free")) sanitized += ":free";
        }
        // avoid double :free from earlier slash conversion
        sanitized = sanitized.replace(/\/free:free$/, ":free").replace(/\/:free$/, ":free");
        rawModel = sanitized;
      }
      // Map alias "auto" and generic aliases to provider's default free model
      const autoMap: Record<string, string> = {
        "nvidia-nim": "nvidia/nemotron-3-ultra-550b-a55b",
        nvidia: "nvidia/nemotron-3-ultra-550b-a55b",
        groq: "llama-3.3-70b-versatile",
        cerebras: "llama3.1-70b",
        "google-gemini": "gemini-2.0-flash",
        gemini: "gemini-2.0-flash",
        "cloudflare-workers-ai": "@cf/meta/llama-3.1-8b-instruct",
        cohere: "command-r-plus",
        "mistral-ai": "mistral-small-latest",
        mistral: "mistral-small-latest",
        modelscope: "Qwen/Qwen3-30b-A3B",
        "chutes-ai": "deepseek-ai/DeepSeek-V3",
        chutes: "deepseek-ai/DeepSeek-V3",
        sambanova: "Meta-Llama-3.1-405B-Instruct",
        siliconflow: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
        "glhf-chat": "hf:meta-llama/Llama-3.1-70B",
        glhf: "hf:meta-llama/Llama-3.1-70B",
        "hugging-face": "meta-llama/Llama-3.1-8B-Instruct",
        huggingface: "meta-llama/Llama-3.1-8B-Instruct",
        "kilo-code": "stepfun/step-3.7-flash:free",
        opencode: "opencode/mimo-v2.5-free",
        "llm7-io": "minimax-m2.7",
        "agnes-ai": "agnes-2.5-flash",
        "aion-labs": "aion-labs/aion-3.0",
        "z-ai-zhipu-ai": "glm-4.7-flash",
        "grok-xai": "grok-2",
        xai: "grok-2",
        deepseek: "deepseek-chat",
        openrouter: "openrouter/auto",
        "ollama-cloud": "llama3.1:70b",
        "alibaba-cloud-model-studio": "qwen-plus",
        nscale: "meta-llama/Llama-3.1-70B",
        nebius: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        "ai21-labs": "jamba-1.5-large",
        orcarouter: "orcarouter/free",
        freeai: "freeai/qwen3-8b",
        cline: "cline/deepseek-v4-flash",
        together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
        novita: "meta-llama/llama-3.1-70b-instruct",
        pollinations: "openai",
      };
      const lower = rawModel.toLowerCase();
      const aliasMap: Record<string, string> = { auto: autoMap[opts.id] || "openai", "gpt-4": autoMap[opts.id] || "openai", "gpt-3.5": autoMap[opts.id] || "openai", llama: autoMap[opts.id] || rawModel, "claude-3": "claude-3-haiku" };
      const model = aliasMap[lower] || rawModel;
      // Build body filtering undefined/null to avoid provider strict validation (kilo 400, agnes 500)
      const body: any = {
        model,
        messages: req.messages,
        stream: req.stream ?? false,
      };
      if (req.temperature !== undefined && req.temperature !== null) body.temperature = req.temperature;
      if (req.max_tokens !== undefined && req.max_tokens !== null) body.max_tokens = req.max_tokens;
      if (req.top_p !== undefined && req.top_p !== null) body.top_p = req.top_p;
      if ((req as any).top_k !== undefined && (req as any).top_k !== null) body.top_k = (req as any).top_k;
      if (req.n !== undefined && req.n !== null) body.n = req.n;
      if (req.stop !== undefined && req.stop !== null) body.stop = req.stop;
      if (req.presence_penalty !== undefined && req.presence_penalty !== null) body.presence_penalty = req.presence_penalty;
      if (req.frequency_penalty !== undefined && req.frequency_penalty !== null) body.frequency_penalty = req.frequency_penalty;
      if (req.tools !== undefined && req.tools !== null) body.tools = req.tools;
      if (req.tool_choice !== undefined && req.tool_choice !== null) body.tool_choice = req.tool_choice;
      if (req.user !== undefined && req.user !== null) body.user = req.user;
      return fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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
