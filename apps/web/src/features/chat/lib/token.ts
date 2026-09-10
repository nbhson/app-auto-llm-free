import type { ChatMessage } from "../types";

export const CHAT_CONSTANTS = {
  ROLE_OVERHEAD: 4,
  IMAGE_TOKENS: 258,
  CHARS_PER_TOKEN: 4,
  MAX_TEXT_FILE: 50000,
  MAX_IMAGE_SIZE: 6 * 1024 * 1024,
  MAX_TEXT_SIZE: 1 * 1024 * 1024,
  PERSIST_DEBOUNCE_MS: 200,
  SCROLL_THROTTLE_MS: 250,
  MODELS_FETCH_TIMEOUT_MS: 8000,
} as const;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Heuristic: ~4 chars per token for English, ~2.5 for mixed/CJK.
  // Keep lightweight in browser; backend uses js-tiktoken when available.
  return Math.ceil(text.length / CHAT_CONSTANTS.CHARS_PER_TOKEN);
}

export function estimateMessageTokens(m: ChatMessage): number {
  let t = estimateTokens(m.content) + CHAT_CONSTANTS.ROLE_OVERHEAD;
  if (m.attachments) {
    for (const a of m.attachments) {
      if (a.type === "image") t += CHAT_CONSTANTS.IMAGE_TOKENS;
      else if (a.text) t += estimateTokens(a.text);
    }
  }
  return t;
}

export function estimateTotalPromptTokens(messages: ChatMessage[], systemPrompt: string): number {
  let total = systemPrompt ? estimateTokens(systemPrompt) + CHAT_CONSTANTS.ROLE_OVERHEAD : 0;
  for (const m of messages) total += estimateMessageTokens(m);
  return total;
}
