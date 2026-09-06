import * as dotenv from "dotenv";
dotenv.config();

function parseTiers(): string[][] {
  try {
    const raw = process.env.FALLBACK_TIERS;
    if (!raw)
      return [
        ["nvidia-nim", "groq", "cerebras", "google-gemini"],
        ["cloudflare-workers-ai", "cohere", "sambanova", "siliconflow"],
        ["ovhcloud-ai-endpoints", "modelscope", "llm7-io", "hugging-face"],
        ["openrouter", "kilo-code", "pollinations"],
      ];
    return JSON.parse(raw);
  } catch {
    return [
      ["nvidia-nim", "groq", "cerebras", "google-gemini"],
      ["cloudflare-workers-ai", "cohere", "sambanova", "siliconflow"],
      ["ovhcloud-ai-endpoints", "modelscope", "llm7-io", "hugging-face"],
      ["openrouter", "kilo-code", "pollinations"],
    ];
  }
}

function parseKeys(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  databaseUrl: process.env.DATABASE_URL || "file:./data.db",
  redisUrl: process.env.REDIS_URL || "",
  masterKey: process.env.MASTER_KEY || "fgk-master-dev-key",
  encryptionKey: process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  defaultModel: process.env.DEFAULT_MODEL || "auto",
  fallbackTiers: parseTiers(),
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || "5", 10),
  circuitBreakerCooldownMs: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || "30000", 10),
  providerKeys: {
    // freellms ids use hyphen, config keys use same slug
    "nvidia-nim": parseKeys(process.env.NVIDIA_API_KEYS),
    openrouter: parseKeys(process.env.OPENROUTER_API_KEYS),
    groq: parseKeys(process.env.GROQ_API_KEYS),
    "ollama-cloud": parseKeys(process.env.OLLAMA_CLOUD_API_KEYS),
    "kilo-code": parseKeys(process.env.KILO_CODE_API_KEYS),
    "github-models": parseKeys(process.env.GITHUB_TOKENS),
    cerebras: parseKeys(process.env.CEREBRAS_API_KEYS),
    "ovhcloud-ai-endpoints": parseKeys(process.env.OVHCLOUD_API_KEYS || process.env.OVH_AI_API_KEYS),
    "google-gemini": parseKeys(process.env.GEMINI_API_KEYS),
    gemini: parseKeys(process.env.GEMINI_API_KEYS), // alias
    "cloudflare-workers-ai": parseKeys(process.env.CLOUDFLARE_API_TOKEN),
    "llm7-io": parseKeys(process.env.LLM7_API_KEYS),
    modelscope: parseKeys(process.env.MODELSCOPE_API_KEYS),
    "chutes-ai": parseKeys(process.env.CHUTES_API_KEYS),
    chutes: parseKeys(process.env.CHUTES_API_KEYS), // alias
    "z-ai-zhipu-ai": parseKeys(process.env.Z_AI_API_KEYS),
    "agnes-ai": parseKeys(process.env.AGNES_API_KEYS),
    "mistral-ai": parseKeys(process.env.MISTRAL_API_KEYS),
    mistral: parseKeys(process.env.MISTRAL_API_KEYS),
    sambanova: parseKeys(process.env.SAMBANOVA_API_KEYS),
    "glhf-chat": parseKeys(process.env.GLHF_API_KEYS),
    glhf: parseKeys(process.env.GLHF_API_KEYS),
    cohere: parseKeys(process.env.COHERE_API_KEYS),
    "hugging-face": parseKeys(process.env.HUGGINGFACE_API_KEYS),
    huggingface: parseKeys(process.env.HUGGINGFACE_API_KEYS),
    "grok-xai": parseKeys(process.env.GROK_API_KEYS || process.env.XAI_API_KEYS),
    siliconflow: parseKeys(process.env.SILICONFLOW_API_KEYS),
    "aion-labs": parseKeys(process.env.AION_API_KEYS),
    opencode: parseKeys(process.env.OPENCODE_API_KEYS),
    deepseek: parseKeys(process.env.DEEPSEEK_API_KEYS),
    xai: parseKeys(process.env.XAI_API_KEYS || process.env.GROK_API_KEYS),
    "alibaba-cloud-model-studio": parseKeys(process.env.ALIBABA_API_KEYS),
    nscale: parseKeys(process.env.NSCALE_API_KEYS),
    nebius: parseKeys(process.env.NEBIUS_API_KEYS),
    "ai21-labs": parseKeys(process.env.AI21_API_KEYS),
    // legacy / scraped
    nvidia: parseKeys(process.env.NVIDIA_API_KEYS),
    together: parseKeys(process.env.TOGETHER_API_KEYS),
    fireworks: parseKeys(process.env.FIREWORKS_API_KEYS),
    novita: parseKeys(process.env.NOVITA_API_KEYS),
    pollinations: parseKeys(process.env.POLLINATIONS_API_KEY),
  } as Record<string, string[]>,
};

export const isPostgres = config.databaseUrl.startsWith("postgres");
