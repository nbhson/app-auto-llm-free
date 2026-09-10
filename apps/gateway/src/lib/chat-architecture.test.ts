import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWeb(file: string): string {
  const p = resolve(process.cwd(), file);
  try { return readFileSync(p, "utf-8"); } catch {
    const alt = resolve(process.cwd(), "../../" + file);
    return readFileSync(alt, "utf-8");
  }
}

describe("Chat 1.6.0 architecture — modular, throttled, memoized, abort-safe", () => {
  it("splits Chat into features/chat/{types,lib,hooks,components}", () => {
    const types = readWeb("apps/web/src/features/chat/types.ts");
    const token = readWeb("apps/web/src/features/chat/lib/token.ts");
    const parser = readWeb("apps/web/src/features/chat/lib/sse-parser.ts");
    const storage = readWeb("apps/web/src/features/chat/lib/storage.ts");
    const hook = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    const attach = readWeb("apps/web/src/features/chat/hooks/useChatAttachments.ts");
    const md = readWeb("apps/web/src/features/chat/components/MarkdownContent.tsx");
    const cb = readWeb("apps/web/src/features/chat/components/CodeBlock.tsx");
    expect(types).toContain("ALLOWED_CHAT_MODELS");
    expect(token).toContain("estimateTokens");
    expect(token).toContain("estimateMessageTokens");
    expect(parser).toContain("extractDelta");
    expect(parser).toContain("parseSseStream");
    expect(storage).toContain("persistMessages");
    expect(storage).toContain("getMasterKey");
    expect(hook).toContain("useChatStream");
    expect(attach).toContain("useChatAttachments");
    expect(md).toContain("MarkdownContent");
    expect(md).toContain("React.memo");
    expect(cb).toContain("CodeBlock");
    expect(cb).toContain("React.memo");
  });

  it("Chat.tsx is slim (<750 LOC, was 1127) and delegates to hooks/components", () => {
    const txt = readWeb("apps/web/src/pages/Chat.tsx");
    const lines = txt.split("\n").length;
    expect(lines).toBeLessThan(750);
    expect(txt).toContain('from "../features/chat/components/MarkdownContent"');
    expect(txt).toContain('from "../features/chat/hooks/useChatStream"');
    expect(txt).toContain('from "../features/chat/hooks/useChatAttachments"');
    expect(txt).toContain('from "../features/chat/types"');
  });

  it("throttles streaming via requestAnimationFrame (not per-chunk setState)", () => {
    const hook = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    expect(hook).toContain("requestAnimationFrame");
    expect(hook).toContain("throttleRef");
    expect(hook).toContain("pending");
    // ensure not calling setMessages directly per delta without batching
    expect(hook).toContain("scheduleFlush");
  });

  it("uses AbortController with cleanup on unmount", () => {
    const hook = readWeb("apps/web/src/features/chat/hooks/useChatStream.ts");
    expect(hook).toContain("AbortController");
    expect(hook).toContain("abortRef");
    expect(hook).toMatch(/useEffect\(\(\) => \{\s*return \(\) =>/s);
    expect(hook).toContain("abort()");
  });

  it("memoizes context token calc and markdown (useMemo / React.memo)", () => {
    const chat = readWeb("apps/web/src/pages/Chat.tsx");
    const md = readWeb("apps/web/src/features/chat/components/MarkdownContent.tsx");
    expect(chat).toContain("useMemo");
    expect(chat).toContain("totalPromptTokens");
    expect(md).toContain("React.memo");
  });

  it("auto-scroll uses RAF throttling, not interval 300ms", () => {
    const txt = readWeb("apps/web/src/pages/Chat.tsx");
    expect(txt).toContain("requestAnimationFrame");
    expect(txt).not.toContain("setInterval(() => scrollToBottom");
  });

  it("persistence debounced + storage helper deduped", () => {
    const chat = readWeb("apps/web/src/pages/Chat.tsx");
    const storage = readWeb("apps/web/src/features/chat/lib/storage.ts");
    expect(chat).toContain("setTimeout(() => persistMessages");
    expect(storage).toContain("persistMessages");
    expect(storage).toContain("prefs");
  });

  it("removes hardcoded fgk-master-dev-key fallback from Chat mk()", () => {
    const storage = readWeb("apps/web/src/features/chat/lib/storage.ts");
    // new storage returns "" when missing; legacy key should not appear as default return value
    expect(storage).not.toContain('return localStorage.getItem("masterKey") || "fgk-master-dev-key"');
    expect(storage).toContain("getMasterKey");
  });

  it("backend chat route uses strict Zod schemas (no z.any)", () => {
    const txt = readWeb("apps/gateway/src/routes/v1/chat.ts");
    expect(txt).toContain("contentPartSchema");
    expect(txt).toContain("toolCallSchema");
    expect(txt).toContain("toolSchema");
    expect(txt).not.toMatch(/z\.array\(z\.any\(\)\)/);
    expect(txt).not.toMatch(/tool_choice: z\.any\(\)/);
  });
});
