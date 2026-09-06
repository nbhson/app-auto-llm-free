import * as dotenv from "dotenv";
dotenv.config();

function parseTiers(): string[][] {
  try {
    const raw = process.env.FALLBACK_TIERS;
    if (!raw) return [["groq", "cerebras"], ["gemini", "together"], ["pollinations", "puter"]];
    return JSON.parse(raw);
  } catch {
    return [["groq", "cerebras"], ["gemini", "together"], ["pollinations", "puter"]];
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
    groq: parseKeys(process.env.GROQ_API_KEYS),
    cerebras: parseKeys(process.env.CEREBRAS_API_KEYS),
    gemini: parseKeys(process.env.GEMINI_API_KEYS),
    together: parseKeys(process.env.TOGETHER_API_KEYS),
    mistral: parseKeys(process.env.MISTRAL_API_KEYS),
    cohere: parseKeys(process.env.COHERE_API_KEYS),
    huggingface: parseKeys(process.env.HUGGINGFACE_API_KEYS),
    github: parseKeys(process.env.GITHUB_TOKENS),
    nvidia: parseKeys(process.env.NVIDIA_API_KEYS),
    siliconflow: parseKeys(process.env.SILICONFLOW_API_KEYS),
    sambanova: parseKeys(process.env.SAMBANOVA_API_KEYS),
    chutes: parseKeys(process.env.CHUTES_API_KEYS),
    fireworks: parseKeys(process.env.FIREWORKS_API_KEYS),
    deepseek: parseKeys(process.env.DEEPSEEK_API_KEYS),
    novita: parseKeys(process.env.NOVITA_API_KEYS),
    openrouter: parseKeys(process.env.OPENROUTER_API_KEYS),
  } as Record<string, string[]>,
};

export const isPostgres = config.databaseUrl.startsWith("postgres");
