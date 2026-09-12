// Token estimator via js-tiktoken (cl100k_base) — single source of truth for quota/compression
// Falls back to heuristic only if encoding fails (never on normal text)
import { getEncoding } from "js-tiktoken";
import type { TokenCountMessage } from "./types.js";

const enc = getEncoding("cl100k_base");

export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return enc.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}
export function estimateTokensWithModel(text: string, _model?: string): number {
  // Future: switch encoding per model (e.g. o200k_base for gpt-4o). Keep cl100k_base as default for gateway.
  return estimateTokens(text);
}

export function estimateMessagesTokens(messages: TokenCountMessage[]): number {
  let total = 0;
  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    total += estimateTokens(content) + 4; // role overhead
  }
  total += 2; // priming
  return total;
}

export function estimateChatTokens(req: { messages: TokenCountMessage[]; max_tokens?: number }): { prompt: number; completion: number; total: number } {
  const prompt = estimateMessagesTokens(req.messages);
  const completion = req.max_tokens || 256;
  return { prompt, completion, total: prompt + completion };
}
