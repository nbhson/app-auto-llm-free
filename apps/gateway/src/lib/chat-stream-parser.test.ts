import { describe, it, expect } from "vitest";

// Mirror of Chat.tsx extractDelta robust logic — tested standalone to guard empty refactor fix
function extractDelta(json: any): { content: string; reasoning: string } {
  if (!json) return { content: "", reasoning: "" };
  if (json.error) {
    const msg = json.error.message || json.error.error || JSON.stringify(json.error);
    return { content: "", reasoning: `__ERROR__:${msg}` };
  }
  const c = json.choices?.[0];
  if (c) {
    const d: any = c.delta ?? c.message ?? {};
    let content = "";
    let reasoning = "";
    if (typeof d === "string") content = d;
    else {
      if (Array.isArray(d.content)) content = d.content.map((p: any) => p.text || p.content || p.output_text || "").join("");
      else content = d.content ?? d.text ?? d.output_text ?? c.text ?? json.content ?? json.text ?? "";
      reasoning = d.reasoning_content ?? d.reasoning ?? d.thinking ?? c.reasoning_content ?? c.reasoning ?? json.reasoning_content ?? json.reasoning ?? "";
      if (!content && Array.isArray(c.content)) content = c.content.map((p: any) => p.text || "").join("");
    }
    if (!content && typeof c.text === "string") content = c.text;
    return { content: content || "", reasoning: reasoning || "" };
  }
  const top = json.content ?? json.text ?? json.output_text ?? json.delta?.content ?? json.delta?.text ?? "";
  return { content: typeof top === "string" ? top : "", reasoning: json.reasoning_content || json.reasoning || "" };
}

// Helper to simulate SSE parsing (buffer + lines) like Chat.tsx does, returns aggregated full
function simulateSseParse(chunks: string[]): { full: string; reasoningFull: string; error: string | null } {
  let buffer = "";
  let full = "";
  let reasoningFull = "";
  let streamError: string | null = null;
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("event:")) continue;
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr) continue;
      if (dataStr === "[DONE]") { buffer = ""; break; }
      try {
        const json = JSON.parse(dataStr);
        if (json.error) { streamError = json.error.message || JSON.stringify(json.error); continue; }
        const { content, reasoning } = extractDelta(json);
        if (reasoning && reasoning.startsWith("__ERROR__:")) { streamError = reasoning.slice("__ERROR__:".length); continue; }
        if (reasoning) reasoningFull += reasoning;
        if (content) full += content;
      } catch {}
    }
    if (streamError) break;
  }
  if (!streamError && buffer.trim().startsWith("data:")) {
    const dataStr = buffer.trim().slice(5).trim();
    if (dataStr && dataStr !== "[DONE]") {
      try { const json = JSON.parse(dataStr); const { content, reasoning } = extractDelta(json); if (reasoning) reasoningFull += reasoning; if (content) full += content; } catch {}
    }
  }
  // fallback reasoning if content empty
  if (!full.trim() && reasoningFull.trim()) full = reasoningFull;
  return { full, reasoningFull, error: streamError };
}

describe("chat stream parser — robust delta extraction (empty refactor fix)", () => {
  it("extracts standard delta.content", () => {
    const j = { choices: [{ delta: { content: "hello " } }] };
    expect(extractDelta(j).content).toBe("hello ");
  });

  it("extracts delta.text fallback (some providers use text)", () => {
    const j = { choices: [{ delta: { text: "hello text" } }] };
    expect(extractDelta(j).content).toBe("hello text");
  });

  it("extracts reasoning_content separately (kilo/kira thinking)", () => {
    const j = { choices: [{ delta: { reasoning_content: "thinking...", content: "" } }] };
    const { content, reasoning } = extractDelta(j);
    expect(content).toBe("");
    expect(reasoning).toBe("thinking...");
  });

  it("extracts reasoning and thinking variants", () => {
    expect(extractDelta({ choices: [{ delta: { reasoning: "r1" } }] }).reasoning).toBe("r1");
    expect(extractDelta({ choices: [{ delta: { thinking: "t1" } }] }).reasoning).toBe("t1");
  });

  it("handles array content (multi-part) -> joins text", () => {
    const j = { choices: [{ delta: { content: [{ text: "part1 " }, { text: "part2" }] } }] };
    expect(extractDelta(j).content).toBe("part1 part2");
  });

  it("handles top-level content fallback (non-OpenAI SSE)", () => {
    const j = { content: "top level" };
    expect(extractDelta(j).content).toBe("top level");
  });

  it("detects error object", () => {
    const j = { error: { message: "quota exceeded" } };
    expect(extractDelta(j).reasoning).toContain("__ERROR__:quota exceeded");
  });

  it("simulates full SSE with ping/event ignored and content aggregated", () => {
    const chunks = [
      ": ping\n\n",
      "event: delta\n",
      'data: {"choices":[{"delta":{"reasoning_content":"thinking 1 "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"thinking 2 "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"refactored code: "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"function foo() {}"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const { full, reasoningFull } = simulateSseParse(chunks);
    expect(reasoningFull).toBe("thinking 1 thinking 2 ");
    expect(full).toBe("refactored code: function foo() {}");
  });

  it("fallback to reasoning when content empty (model only returned thinking)", () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"only reasoning"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const { full, reasoningFull } = simulateSseParse(chunks);
    expect(reasoningFull).toBe("only reasoning");
    expect(full).toBe("only reasoning"); // fallback applied
  });

  it("ignores : ping and event: lines, handles leftover buffer without newline", () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"hello"}}]}', // no trailing \n in this chunk
    ];
    // simulate final flush: buffer holds data line without newline -> should be flushed
    const { full } = simulateSseParse(chunks);
    // without newline, simulateSseParse flushes leftover buffer
    expect(full).toBe("hello");
  });

  it("aggregates split JSON across chunks (incomplete line buffering)", () => {
    // SSE spec: JSON may be split across TCP chunks; parser buffers until newline
    const part1 = 'data: {"choices":[{"delta":{"content":"hel';
    const part2 = 'lo world"}}]}\n\n';
    const { full } = simulateSseParse([part1, part2]);
    expect(full).toBe("hello world");
  });

  it("handles stream error inside data", () => {
    const chunks = ['data: {"error":{"message":"rate limited"}}\n\n'];
    const { error } = simulateSseParse(chunks);
    expect(error).toContain("rate limited");
  });
});
