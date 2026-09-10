import type { ChatMessage } from "../types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Heuristic: ~4 chars per token for English, ~2.5 for mixed/CJK.
  // Keep lightweight in browser; backend uses js-tiktoken when available.
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(m: ChatMessage): number {
  let t = estimateTokens(m.content) + 4; // role overhead
  if (m.attachments) {
    for (const a of m.attachments) {
      if (a.type === "image") t += 258; // rough vision token (512x512 patch)
      else if (a.text) t += estimateTokens(a.text);
    }
  }
  return t;
}

export function estimateTotalPromptTokens(messages: ChatMessage[], systemPrompt: string): number {
  let total = systemPrompt ? estimateTokens(systemPrompt) + 4 : 0;
  for (const m of messages) total += estimateMessageTokens(m);
  return total;
}
