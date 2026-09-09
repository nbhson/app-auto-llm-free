import { estimateMessagesTokens } from "./token-estimator.js";
import type { CompressibleMessage, TokenCountMessage } from "./types.js";

export interface CompressOpts {
  maxTokens?: number;
  engines?: string[];
}

export interface CompressResult {
  messages: CompressibleMessage[];
  ratio: number;
  savedTokens: number;
}

function truncateSchemaStrings(obj: unknown, maxStrLen = 200): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj.length > maxStrLen ? obj.slice(0, maxStrLen) + "…" : obj;
  if (Array.isArray(obj)) return obj.map((v) => truncateSchemaStrings(v, maxStrLen));
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      // keep structural keys intact, truncate long string values (esp. description)
      if (k === "description" && typeof v === "string" && v.length > 100) out[k] = v.slice(0, 100) + "…";
      else out[k] = truncateSchemaStrings(v, maxStrLen);
    }
    return out;
  }
  return obj;
}

/**
 * Minify tool definitions: strip descriptions >100 chars and safely truncate large schemas
 * without dropping required/enum fields (fixes previous wipe to empty properties).
 */
export function toolsMinify(messages: CompressibleMessage[]): CompressibleMessage[] {
  return messages.map((m) => {
    if (!m.tools && !m.tool_choice && !m.functions) return m;
    const clone: CompressibleMessage = { ...m };
    if (Array.isArray(clone.tools)) {
      clone.tools = clone.tools.map((t) => {
        if (!t.function) return t;
        const fn = { ...t.function };
        if (typeof fn.description === "string" && fn.description.length > 100) {
          fn.description = fn.description.slice(0, 100) + "…";
        }
        // safely truncate large parameter schemas instead of wiping
        if (fn.parameters && JSON.stringify(fn.parameters).length > 1000) {
          fn.parameters = truncateSchemaStrings(fn.parameters, 200);
          // still too large after truncation -> progressively truncate with smaller limits
          // instead of slicing JSON string (which breaks JSON syntax)
          let jsonLen = JSON.stringify(fn.parameters).length;
          let truncateLimit = 150;
          while (jsonLen > 2000 && truncateLimit > 20) {
            fn.parameters = truncateSchemaStrings(fn.parameters, truncateLimit);
            jsonLen = JSON.stringify(fn.parameters).length;
            truncateLimit = Math.floor(truncateLimit * 0.7);
          }
          // if still too large, keep only required/enum/type structure without descriptions
          if (jsonLen > 2000) {
            try {
              fn.parameters = truncateSchemaStrings(fn.parameters, 20);
              if (JSON.stringify(fn.parameters).length > 2000) {
                // last resort: keep minimal schema shape
                const prev = fn.parameters as { type?: unknown } | null;
                fn.parameters = {
                  type: (prev && typeof prev === "object" ? prev.type : undefined) || "object",
                  properties: {},
                };
              }
            } catch {
              fn.parameters = { type: "object", properties: {} };
            }
          }
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
 * Fixed: use value comparison instead of reference equality (kept.includes was always false
 * because system/rest are disjoint filtered arrays).
 */
export function historySummarize(messages: CompressibleMessage[]): CompressibleMessage[] {
  if (messages.length <= 6) return messages;
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const kept = rest.slice(-6);
  if (system.length > 0) {
    const lastSystem = system[system.length - 1];
    const duplicate = kept.some((m) => JSON.stringify(m) === JSON.stringify(lastSystem));
    if (!duplicate) return [lastSystem, ...kept];
  }
  return kept;
}

/**
 * Remove duplicate code blocks (``` ... ```) keeping first occurrence.
 * Fixed: keep first global occurrence, remove subsequent duplicates only.
 */
export function codeDedup(messages: CompressibleMessage[]): CompressibleMessage[] {
  const seen = new Set<string>();
  const codeBlockRe = /```[\s\S]*?```/g;
  return messages.map((m) => {
    if (typeof m.content !== "string") return m;
    const blocks = m.content.match(codeBlockRe);
    if (!blocks) return m;
    let deduped = m.content;
    const localSeen = new Set<string>();
    for (const block of blocks) {
      const norm = block.trim();
      const isDuplicate = seen.has(norm) || localSeen.has(norm);
      if (isDuplicate) {
        // remove only the last occurrence of this block, keep first
        const idx = deduped.lastIndexOf(block);
        if (idx !== -1) deduped = deduped.slice(0, idx) + deduped.slice(idx + block.length);
      } else {
        seen.add(norm);
        localSeen.add(norm);
      }
    }
    if (deduped === m.content) return m;
    return { ...m, content: deduped.replace(/\n{3,}/g, "\n\n").trim() };
  });
}

function calcLength(messages: CompressibleMessage[]): number {
  try {
    return JSON.stringify(messages).length;
  } catch {
    return messages.reduce((a, m) => a + JSON.stringify(m).length, 0);
  }
}

/**
 * Workflow Stage wrapper (harness 07): metrics + guard
 */
export interface CompressionStageMetrics {
  stage: string;
  durationMs: number;
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  applied: boolean;
}

export function compressWithMetrics(messages: CompressibleMessage[], opts: CompressOpts = {}): CompressResult & { metrics: CompressionStageMetrics } {
  const start = Date.now();
  const result = compressMessages(messages, opts);
  const durationMs = Date.now() - start;
  return {
    ...result,
    metrics: {
      stage: "compression",
      durationMs,
      originalTokens: result.savedTokens + estimateMessagesTokens(result.messages),
      compressedTokens: estimateMessagesTokens(result.messages),
      ratio: result.ratio,
      applied: result.ratio < 0.95 && result.savedTokens > 0,
    },
  };
}

/**
 * Compress messages using selected engines.
 * Ratio now token-based (compressedTokens / originalTokens) for consistency
 * with token-estimator; falls back to length ratio if originalTokens==0.
 * Harness 02 Build Context: respects maxTokens budget (drop oldest non-system).
 */
export function compressMessages(messages: CompressibleMessage[], opts: CompressOpts = {}): CompressResult {
  const engines = opts.engines ?? ["toolsMinify", "historySummarize", "codeDedup"];
  const originalLength = calcLength(messages);
  const originalTokens = estimateMessagesTokens(messages as TokenCountMessage[]);

  let out: CompressibleMessage[] = [...messages];

  if (engines.includes("toolsMinify")) out = toolsMinify(out);
  if (engines.includes("historySummarize")) out = historySummarize(out);
  if (engines.includes("codeDedup")) out = codeDedup(out);

  // Optional token budget truncation: drop oldest non-system until under maxTokens
  if (opts.maxTokens && opts.maxTokens > 0) {
    let tokens = estimateMessagesTokens(out as TokenCountMessage[]);
    while (tokens > opts.maxTokens && out.length > 1) {
      // remove second element (keep system at 0)
      const hasSystem = out[0]?.role === "system";
      const idx = hasSystem ? 1 : 0;
      out.splice(idx, 1);
      tokens = estimateMessagesTokens(out as TokenCountMessage[]);
    }
  }

  const compressedLength = calcLength(out);
  const compressedTokens = estimateMessagesTokens(out as TokenCountMessage[]);
  const tokenRatio = originalTokens === 0 ? 1 : compressedTokens / originalTokens;
  const lengthRatio = originalLength === 0 ? 1 : compressedLength / originalLength;
  // prefer token ratio (more meaningful for cost), keep 3-decimal
  const ratio = Number((originalTokens > 0 ? tokenRatio : lengthRatio).toFixed(3));
  const savedTokens = Math.max(0, originalTokens - compressedTokens);

  return { messages: out, ratio, savedTokens };
}
