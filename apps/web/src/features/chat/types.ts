export type Attachment = {
  id: string;
  name: string;
  type: "image" | "text";
  size: number;
  dataUrl?: string;
  text?: string;
  preview?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  error?: string;
  truncated?: boolean;
};

export type ModelEntry = {
  id: string;
  owned_by: string;
  context_length?: number;
  score?: number;
  live_status?: string;
};

/** Allowed chat models — strict 6 per product requirement (added free-llm-gateway/auto) */
export const ALLOWED_CHAT_MODELS = [
  "free-llm-gateway/auto",
  "kilo-code/kilo-auto/free",
  "kilo-code/auto",
  "openrouter/auto",
  "kiraai/kira-auto",
  "agnes-ai/agnes-2.5-flash",
] as const;

export type AllowedChatModel = (typeof ALLOWED_CHAT_MODELS)[number];

export const ALLOWED_SET = new Set<string>(ALLOWED_CHAT_MODELS as readonly string[]);

export const FALLBACK_CONTEXT: Record<string, number> = {
  "free-llm-gateway/auto": 128000,
  "kilo-code/kilo-auto/free": 262000,
  "kilo-code/auto": 262000,
  "openrouter/auto": 262144,
  "kiraai/kira-auto": 128000,
  "agnes-ai/agnes-2.5-flash": 256000,
};

export type ChatMeta = {
  provider?: string;
  model?: string;
  latencyMs?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; promptTokens?: number; completionTokens?: number };
};
