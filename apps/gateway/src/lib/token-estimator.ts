// Simple char-based token estimator (1 token ~4 chars, like tiktoken heuristic)
// If js-tiktoken is installed, it will be used lazily via dynamic import (optional dep)
let tiktokenEnc: any = null;
let tiktokenTried = false;
function getTiktoken() {
  if (tiktokenTried) return tiktokenEnc;
  tiktokenTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: any = eval("require")("js-tiktoken");
    if (mod?.getEncoding) tiktokenEnc = mod.getEncoding("cl100k_base");
  } catch {}
  return tiktokenEnc;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const enc = getTiktoken();
  if (enc) {
    try { return enc.encode(text).length; } catch {}
  }
  return Math.ceil(text.length / 4);
}
export function estimateTokensWithModel(text: string, _model?: string): number {
  return estimateTokens(text);
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
