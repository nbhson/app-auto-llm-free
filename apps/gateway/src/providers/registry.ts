import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import { geminiProvider } from "./gemini.js";
import { pollinationsProvider } from "./pollinations.js";
import type { Provider } from "./base.js";

// === Base URLs from freellms.org (2026-09-06 scan) ===
// See data/freellms-providers.json + docs/FREELLMS_FREE_TIER.md
const OPENAI = createOpenAICompatibleProvider;

export const providers: Record<string, Provider> = {
  // P0 — Permanent Free, high free model count, OpenAI compatible
  "nvidia-nim": OPENAI({ id: "nvidia-nim", baseUrl: "https://integrate.api.nvidia.com/v1" }), // 97 free, 40 RPM
  groq: OPENAI({ id: "groq", baseUrl: "https://api.groq.com/openai/v1" }), // 7 free
  cerebras: OPENAI({ id: "cerebras", baseUrl: "https://api.cerebras.ai/v1" }), // 5
  "github-models": OPENAI({ id: "github-models", baseUrl: "https://models.github.ai/inference" }), // 13, quota
  "ovhcloud-ai-endpoints": OPENAI({ id: "ovhcloud-ai-endpoints", baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1" }), // 10
  cohere: OPENAI({ id: "cohere", baseUrl: "https://api.cohere.ai/compatibility/v1" }), // 10, rerank/embedding (OpenAI compat)
  "mistral-ai": OPENAI({ id: "mistral-ai", baseUrl: "https://api.mistral.ai/v1" }), // 9, quota
  mistral: OPENAI({ id: "mistral", baseUrl: "https://api.mistral.ai/v1" }), // alias

  // Cloudflare Workers AI — special path with {account_id}, uses Bearer token
  "cloudflare-workers-ai": OPENAI({ id: "cloudflare-workers-ai", baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1" }),

  // ModelScope, Chutes, SambaNova, SiliconFlow — OpenAI compat
  modelscope: OPENAI({ id: "modelscope", baseUrl: "https://api-inference.modelscope.cn/v1" }), // 43
  "chutes-ai": OPENAI({ id: "chutes-ai", baseUrl: "https://api.chutes.ai/v1" }), // 2
  chutes: OPENAI({ id: "chutes", baseUrl: "https://llm.chutes.ai/v1" }), // alias legacy
  sambanova: OPENAI({ id: "sambanova", baseUrl: "https://api.sambanova.ai/v1" }), // 4
  siliconflow: OPENAI({ id: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1" }), // 2
  "glhf-chat": OPENAI({ id: "glhf-chat", baseUrl: "https://glhf.chat/api/openai/v1" }), // 2
  glhf: OPENAI({ id: "glhf-chat", baseUrl: "https://glhf.chat/api/openai/v1" }),
  "hugging-face": OPENAI({ id: "hugging-face", baseUrl: "https://router.huggingface.co/v1" }), // 4, quota
  huggingface: OPENAI({ id: "hugging-face", baseUrl: "https://router.huggingface.co/v1" }),
  "kilo-code": OPENAI({ id: "kilo-code", baseUrl: "https://api.kilo.ai/api/gateway" }), // 8, :free suffix
  opencode: OPENAI({ id: "opencode", baseUrl: "https://opencode.ai/zen/v1" }), // 8
  "llm7-io": OPENAI({ id: "llm7-io", baseUrl: "https://api.llm7.io/v1" }), // 6
  "agnes-ai": OPENAI({ id: "agnes-ai", baseUrl: "https://apihub.agnes-ai.com/v1" }), // 5, 30 RPM
  "aion-labs": OPENAI({ id: "aion-labs", baseUrl: "https://api.aionlabs.ai/v1" }), // 5
  "z-ai-zhipu-ai": OPENAI({ id: "z-ai-zhipu-ai", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }), // 4 GLM
  "grok-xai": OPENAI({ id: "grok-xai", baseUrl: "https://api.x.ai/v1" }), // 2, needs card
  xai: OPENAI({ id: "xai", baseUrl: "https://api.x.ai/v1" }),
  deepseek: OPENAI({ id: "deepseek", baseUrl: "https://api.deepseek.com/v1" }),
  openrouter: OPENAI({ id: "openrouter", baseUrl: "https://openrouter.ai/api/v1" }), // 17 free
  "ollama-cloud": OPENAI({ id: "ollama-cloud", baseUrl: "https://api.ollama.com" }), // 3 free, stub
  "alibaba-cloud-model-studio": OPENAI({ id: "alibaba-cloud-model-studio", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }),
  nscale: OPENAI({ id: "nscale", baseUrl: "https://api.nscale.com/v1" }),
  nebius: OPENAI({ id: "nebius", baseUrl: "https://api.studio.nebius.com/v1" }),
  "ai21-labs": OPENAI({ id: "ai21-labs", baseUrl: "https://api.ai21.com/studio/v1" }),

  // Custom from opencode.json (ORCAROUTER/FREEAI/CLINE)
  orcarouter: OPENAI({ id: "orcarouter", baseUrl: "https://api.orcarouter.ai/v1" }),
  freeai: OPENAI({ id: "freeai", baseUrl: "https://api.free.ai/v1" }),
  cline: OPENAI({ id: "cline", baseUrl: "https://api.cline.bot/api/v1" }),

  // Legacy / extra
  together: OPENAI({ id: "together", baseUrl: "https://api.together.xyz/v1" }),
  fireworks: OPENAI({ id: "fireworks", baseUrl: "https://api.fireworks.ai/inference/v1" }),
  novita: OPENAI({ id: "novita", baseUrl: "https://api.novita.ai/v3/openai" }),
  nvidia: OPENAI({ id: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1" }), // alias

  // Special
  "google-gemini": geminiProvider,
  gemini: geminiProvider, // alias
  pollinations: pollinationsProvider,
};

export const providerIds = Object.keys(providers);

// Metadata for docs / dashboard (caps, tier)
export const providerMeta: Record<string, { name: string; tier: string; tier_type: string; caps: string[]; noCard: boolean }> = {
  "nvidia-nim": { name: "NVIDIA NIM", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","image","video","embedding"], noCard: true },
  modelscope: { name: "ModelScope", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image","video"], noCard: true },
  "cloudflare-workers-ai": { name: "Cloudflare Workers AI", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image","reasoning","code"], noCard: true },
  openrouter: { name: "OpenRouter", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","code"], noCard: true },
  "google-gemini": { name: "Google Gemini", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image","video","audio"], noCard: true },
  "github-models": { name: "GitHub Models", tier: "Quota", tier_type: "quota", caps: ["text","reasoning"], noCard: true },
  "ovhcloud-ai-endpoints": { name: "OVHcloud AI Endpoints", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image"], noCard: true },
  cohere: { name: "Cohere", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","embedding","rerank"], noCard: true },
  "mistral-ai": { name: "Mistral AI", tier: "Quota", tier_type: "quota", caps: ["text","code"], noCard: true },
  "kilo-code": { name: "Kilo Code", tier: "Quota", tier_type: "quota", caps: ["text","reasoning"], noCard: true },
  opencode: { name: "OpenCode Zen", tier: "Permanent Free", tier_type: "permanent", caps: ["reasoning","vision"], noCard: true },
  groq: { name: "Groq", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "llm7-io": { name: "LLM7.io", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  cerebras: { name: "Cerebras", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "agnes-ai": { name: "Agnes AI", tier: "Permanent Free", tier_type: "permanent", caps: ["text","vision"], noCard: true },
  "aion-labs": { name: "Aion Labs", tier: "Permanent Free", tier_type: "permanent", caps: ["text"], noCard: true },
  "z-ai-zhipu-ai": { name: "Z AI (Zhipu AI)", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  sambanova: { name: "SambaNova", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "hugging-face": { name: "Hugging Face", tier: "Quota", tier_type: "quota", caps: ["text","code"], noCard: true },
  "ollama-cloud": { name: "Ollama Cloud", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "chutes-ai": { name: "Chutes.ai", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "glhf-chat": { name: "Glhf.chat", tier: "Permanent Free", tier_type: "permanent", caps: ["text"], noCard: true },
  "grok-xai": { name: "Grok (xAI)", tier: "Permanent Free", tier_type: "permanent", caps: ["text"], noCard: false },
  siliconflow: { name: "SiliconFlow", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  deepseek: { name: "DeepSeek", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  orcarouter: { name: "OrcaRouter", tier: "Custom", tier_type: "custom", caps: ["text","reasoning"], noCard: true },
  freeai: { name: "FreeAI", tier: "Custom", tier_type: "custom", caps: ["text"], noCard: true },
  cline: { name: "Cline", tier: "Custom", tier_type: "custom", caps: ["text"], noCard: true },
};

// Alias map for smart routing (freellms-aware + custom opencode) — auto includes full 4-tier + public fallback
export const modelAliases: Record<string, string[]> = {
  auto: [
    "nvidia-nim",
    "groq",
    "cerebras",
    "google-gemini",
    "cloudflare-workers-ai",
    "cohere",
    "sambanova",
    "siliconflow",
    "ovhcloud-ai-endpoints",
    "modelscope",
    "llm7-io",
    "hugging-face",
    "openrouter",
    "kilo-code",
    "pollinations",
    "orcarouter",
    "freeai",
    "cline",
  ],
  "gpt-4": ["groq", "cerebras", "google-gemini", "openrouter", "nvidia-nim"],
  "gpt-3.5": ["groq", "pollinations", "ovhcloud-ai-endpoints", "modelscope"],
  "claude-3": ["cohere", "hugging-face", "openrouter", "mistral-ai"],
  gemini: ["google-gemini"],
  "gemini-flash": ["google-gemini"],
  llama: ["groq", "cerebras", "nvidia-nim", "sambanova", "ovhcloud-ai-endpoints"],
  qwen: ["modelscope", "ovhcloud-ai-endpoints", "siliconflow", "alibaba-cloud-model-studio"],
  deepseek: ["deepseek", "siliconflow", "chutes-ai", "nvidia-nim"],
  mistral: ["mistral-ai", "groq", "nvidia-nim"],
  glm: ["z-ai-zhipu-ai", "nvidia-nim", "modelscope"],
  kimi: ["groq", "nvidia-nim", "modelscope"],
  code: ["kilo-code", "opencode", "cohere", "mistral-ai"],
  embedding: ["cohere", "nvidia-nim", "cloudflare-workers-ai"],
  rerank: ["cohere", "nvidia-nim"],
};

export function resolveProvidersForModel(model: string): string[] {
  if (model.includes("/")) {
    const prefix = model.split("/")[0];
    if (providers[prefix]) return [prefix];
    // freellms slug with hyphen: nvidia-nim/z-ai/glm-5.2 -> try first part
    const slug = model.split("/")[0];
    if (providers[slug]) return [slug];
  }
  const alias = modelAliases[model.toLowerCase()];
  if (alias) return alias;
  return providerIds;
}
