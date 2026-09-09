import { estimateMessagesTokens } from "./token-estimator.js";
import type { CompressibleMessage, TokenCountMessage } from "./types.js";

export interface CompressOpts {
  maxTokens?: number;
  engines?: string[];
  relevance?: RelevanceOpts;
}

export interface RelevanceOpts {
  /** trailing non-system messages always kept (default 3) */
  keepRecent?: number;
  /** top relevant older messages to keep (default 5) */
  keepRelevant?: number;
  /** skip relevance when history is at most this long (default 8) */
  minLength?: number;
}

function messageText(m: CompressibleMessage): string {
  return typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 2);
}

/**
 * BM25-lite relevance: query token overlap, length-normalized.
 * Sync + dependency-free (no embedding call on the hot path).
 */
export function relevanceScore(message: string, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  const tokens = tokenize(message);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const t of new Set(tokens)) if (queryTokens.has(t)) hits++;
  return hits / Math.sqrt(tokens.length);
}

/**
 * Query-aware keep: always retain system + trailing recent messages, then fill
 * the budget with the older messages most relevant to the last user message.
 * Unlike pure recency truncation, topics referenced earlier (ids, constraints,
 * decisions) survive when the conversation returns to them.
 */
export function relevanceKeep(messages: CompressibleMessage[], opts: RelevanceOpts = {}): CompressibleMessage[] {
  const { keepRecent = 3, keepRelevant = 5, minLength = 8 } = opts;
  if (messages.length <= minLength) return messages;
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= keepRecent + keepRelevant) return messages;
  // query = last user message (what the model must answer next)
  const lastUser = [...rest].reverse().find((m) => m.role === "user");
  const queryTokens = new Set(tokenize(lastUser ? messageText(lastUser) : ""));
  const recent = rest.slice(-keepRecent);
  const candidates = rest.slice(0, -keepRecent);
  const scored = candidates.map((m, i) => ({ m, i, s: relevanceScore(messageText(m), queryTokens) }));
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const keptIdx = new Set(scored.slice(0, keepRelevant).map((x) => x.i));
  const out = [...candidates.filter((_, i) => keptIdx.has(i)), ...recent];
  // restore chronological order (same object refs, index via identity)
  const order = new Map<CompressibleMessage, number>();
  messages.forEach((m, i) => {
    if (!order.has(m)) order.set(m, i);
  });
  out.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  if (system.length > 0) {
    const lastSystem = system[system.length - 1];
    if (!out.includes(lastSystem)) return [lastSystem, ...out];
  }
  return out;
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
 * Normalizes whitespace before comparing so near-duplicate pastes
 * (re-indented or re-spaced copies) are also caught.
 */
export function normalizeCodeBlock(block: string): string {
  return block
    .replace(/```\w*\n?/, "")
    .replace(/```\s*$/, "")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n");
}

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
      const norm = normalizeCodeBlock(block);
      // empty blocks are never deduped (avoid collapsing intentional placeholders)
      const isDuplicate = norm.length > 0 && (seen.has(norm) || localSeen.has(norm));
      if (isDuplicate) {
        // remove only the last occurrence of this block, keep first
        const idx = deduped.lastIndexOf(block);
        if (idx !== -1) deduped = deduped.slice(0, idx) + deduped.slice(idx + block.length);
      } else if (norm.length > 0) {
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
  // relevance first (shrinks by importance), then recency cap, then dedup
  const engines = opts.engines ?? ["toolsMinify", "relevanceKeep", "historySummarize", "codeDedup"];
  const originalLength = calcLength(messages);
  const originalTokens = estimateMessagesTokens(messages as TokenCountMessage[]);

  let out: CompressibleMessage[] = [...messages];

  if (engines.includes("toolsMinify")) out = toolsMinify(out);
  if (engines.includes("relevanceKeep")) out = relevanceKeep(out, opts.relevance);
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
