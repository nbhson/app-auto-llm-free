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

// Keep sync heuristic for immediate UI (bundle < 1KB); accurate tiktoken loaded lazily via dynamic import
let tiktokenEnc: { encode: (s: string) => number[] } | null = null;
let tiktokenReady = false;
async function getTiktoken() {
  if (tiktokenReady) return tiktokenEnc;
  tiktokenReady = true;
  try {
    const mod = await import("js-tiktoken");
    tiktokenEnc = mod.getEncoding("cl100k_base");
  } catch { tiktokenEnc = null; }
  return tiktokenEnc;
}
// Warm up in idle
if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => { void getTiktoken(); });
  else setTimeout(() => { void getTiktoken(); }, 1500);
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  if (tiktokenEnc) {
    try { return tiktokenEnc.encode(text).length; } catch { /* fallback */ }
  }
  return Math.ceil(text.length / CHAT_CONSTANTS.CHARS_PER_TOKEN);
}
export async function estimateTokensAccurate(text: string): Promise<number> {
  const enc = await getTiktoken();
  if (enc) { try { return enc.encode(text).length; } catch { /* fallback */ } }
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
