import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import { geminiProvider } from "./gemini.js";
import { pollinationsProvider } from "./pollinations.js";
import type { Provider } from "./base.js";

export const providers: Record<string, Provider> = {
  groq: createOpenAICompatibleProvider({ id: "groq", baseUrl: "https://api.groq.com/openai/v1" }),
  cerebras: createOpenAICompatibleProvider({ id: "cerebras", baseUrl: "https://api.cerebras.ai/v1" }),
  together: createOpenAICompatibleProvider({ id: "together", baseUrl: "https://api.together.xyz/v1" }),
  fireworks: createOpenAICompatibleProvider({ id: "fireworks", baseUrl: "https://api.fireworks.ai/inference/v1" }),
  sambanova: createOpenAICompatibleProvider({ id: "sambanova", baseUrl: "https://api.sambanova.ai/v1" }),
  mistral: createOpenAICompatibleProvider({ id: "mistral", baseUrl: "https://api.mistral.ai/v1" }),
  cohere: createOpenAICompatibleProvider({ id: "cohere", baseUrl: "https://api.cohere.ai/compatibility/v1" }),
  huggingface: createOpenAICompatibleProvider({ id: "huggingface", baseUrl: "https://api-inference.huggingface.co/v1" }),
  nvidia: createOpenAICompatibleProvider({ id: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1" }),
  siliconflow: createOpenAICompatibleProvider({ id: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1" }),
  novita: createOpenAICompatibleProvider({ id: "novita", baseUrl: "https://api.novita.ai/v3/openai" }),
  chutes: createOpenAICompatibleProvider({ id: "chutes", baseUrl: "https://llm.chutes.ai/v1" }),
  deepseek: createOpenAICompatibleProvider({ id: "deepseek", baseUrl: "https://api.deepseek.com/v1" }),
  openrouter: createOpenAICompatibleProvider({ id: "openrouter", baseUrl: "https://openrouter.ai/api/v1" }),
  github: createOpenAICompatibleProvider({ id: "github", baseUrl: "https://models.inference.ai.azure.com" }),

  gemini: geminiProvider,
  pollinations: pollinationsProvider,
};

export const providerIds = Object.keys(providers);

// Alias map for smart routing
export const modelAliases: Record<string, string[]> = {
  auto: ["groq", "cerebras", "gemini", "pollinations"],
  "gpt-4": ["groq", "cerebras", "gemini", "openrouter"],
  "gpt-3.5": ["groq", "pollinations", "together"],
  "claude-3": ["cohere", "huggingface", "openrouter"],
  gemini: ["gemini"],
  "gemini-flash": ["gemini"],
  llama: ["groq", "cerebras", "together", "sambanova"],
  mistral: ["mistral", "groq"],
  qwen: ["together", "siliconflow", "novita"],
  deepseek: ["deepseek", "siliconflow", "chutes"],
};

export function resolveProvidersForModel(model: string): string[] {
  if (model.includes("/")) {
    const prefix = model.split("/")[0];
    if (providers[prefix]) return [prefix];
  }
  const alias = modelAliases[model.toLowerCase()];
  if (alias) return alias;
  // fallback to all OpenAI-compatible + pollinations
  return providerIds;
}
