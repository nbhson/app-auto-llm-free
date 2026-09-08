import { estimateMessagesTokens } from "./token-estimator.js";

export interface CompressOpts {
  maxTokens?: number;
  engines?: string[];
}

export interface CompressResult {
  messages: any[];
  ratio: number;
  savedTokens: number;
}

/**
 * Minify tool definitions: strip descriptions >100 chars and truncate long JSON.
 */
export function toolsMinify(messages: any[]): any[] {
  return messages.map((m) => {
    if (!m.tools && !m.tool_choice && !m.functions) return m;
    const clone = { ...m };
    if (Array.isArray(clone.tools)) {
      clone.tools = clone.tools.map((t: any) => {
        if (!t.function) return t;
        const fn = { ...t.function };
        if (typeof fn.description === "string" && fn.description.length > 100) {
          fn.description = fn.description.slice(0, 100) + "…";
        }
        // trim large parameter schemas pretty-printed
        if (fn.parameters && JSON.stringify(fn.parameters).length > 1000) {
          fn.parameters = { type: "object", properties: {} };
        }
        return { ...t, function: fn };
      });
    }
    if (typeof clone.content === "string" && clone.content.length > 2000) {
      clone.content = clone.content.slice(0, 2000);
    }
    return clone;
  });
}

/**
 * Truncate old messages keeping last 6 plus system prompt if present.
 */
export function historySummarize(messages: any[]): any[] {
  if (messages.length <= 6) return messages;
  const system = messages.filter((m: any) => m.role === "system");
  const rest = messages.filter((m: any) => m.role !== "system");
  const kept = rest.slice(-6);
  // if system was at front, keep it; avoid duplication
  if (system.length > 0) {
    const lastSystem = system[system.length - 1];
    // ensure not already in kept
    if (!kept.includes(lastSystem)) return [lastSystem, ...kept];
  }
  return kept;
}

/**
 * Remove duplicate code blocks (``` ... ```) keeping first occurrence.
 */
export function codeDedup(messages: any[]): any[] {
  const seen = new Set<string>();
  const codeBlockRe = /```[\s\S]*?```/g;
  return messages.map((m: any) => {
    if (typeof m.content !== "string") return m;
    const blocks = m.content.match(codeBlockRe);
    if (!blocks || blocks.length <= 1) return m;
    let deduped = m.content;
    for (const block of blocks) {
      const norm = block.trim();
      if (seen.has(norm)) {
        deduped = deduped.replace(block, "");
      } else {
        seen.add(norm);
      }
    }
    // also dedup within single message
    const innerSeen = new Set<string>();
    const innerBlocks = deduped.match(codeBlockRe) || [];
    let final = deduped;
    for (const b of innerBlocks) {
      const n = b.trim();
      if (innerSeen.has(n)) final = final.replace(b, "");
      else innerSeen.add(n);
    }
    return { ...m, content: final.replace(/\n{3,}/g, "\n\n").trim() };
  });
}

function calcLength(messages: any[]): number {
  try {
    return JSON.stringify(messages).length;
  } catch {
    return messages.reduce((a, m) => a + JSON.stringify(m).length, 0);
  }
}

/**
 * Compress messages using selected engines.
 * Ratio = compressedLength / originalLength (1 = no saving, <1 = compressed)
 */
export function compressMessages(messages: any[], opts: CompressOpts = {}): CompressResult {
  const engines = opts.engines ?? ["toolsMinify", "historySummarize", "codeDedup"];
  const originalLength = calcLength(messages);
  const originalTokens = estimateMessagesTokens(messages as any);

  let out: any[] = [...messages];

  if (engines.includes("toolsMinify")) out = toolsMinify(out);
  if (engines.includes("historySummarize")) out = historySummarize(out);
  if (engines.includes("codeDedup")) out = codeDedup(out);

  // Optional token budget truncation: drop oldest non-system until under maxTokens
  if (opts.maxTokens && opts.maxTokens > 0) {
    let tokens = estimateMessagesTokens(out as any);
    while (tokens > opts.maxTokens && out.length > 1) {
      // remove second element (keep system at 0)
      const hasSystem = out[0]?.role === "system";
      const idx = hasSystem ? 1 : 0;
      out.splice(idx, 1);
      tokens = estimateMessagesTokens(out as any);
    }
  }

  const compressedLength = calcLength(out);
  const compressedTokens = estimateMessagesTokens(out as any);
  const ratio = originalLength === 0 ? 1 : compressedLength / originalLength;
  const savedTokens = Math.max(0, originalTokens - compressedTokens);

  return { messages: out, ratio: Number(ratio.toFixed(3)), savedTokens };
}
