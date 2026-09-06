// Simple char-based token estimator (1 token ~4 chars, like tiktoken heuristic)
// For P3 we avoid heavy tiktoken dep; P4 can swap to js-tiktoken.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Array<{ role: string; content: string | any }>): number {
  let total = 0;
  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    total += estimateTokens(content) + 4; // role overhead
  }
  total += 2; // priming
  return total;
}

export function estimateChatTokens(req: { messages: Array<{ role: string; content: any }>; max_tokens?: number }): { prompt: number; completion: number; total: number } {
  const prompt = estimateMessagesTokens(req.messages);
  const completion = req.max_tokens || 256;
  return { prompt, completion, total: prompt + completion };
}
