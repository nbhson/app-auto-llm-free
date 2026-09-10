import { useRef, useCallback, useEffect } from "react";
import { extractDelta } from "../lib/sse-parser";
import { getMasterKey } from "../lib/storage";
import type { ChatMessage } from "../types";

type UseChatStreamOpts = {
  selectedModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  streamEnabled: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setLastMeta: React.Dispatch<React.SetStateAction<{ provider?: string; model?: string; latencyMs?: number; usage?: unknown } | null>>;
  setError: (e: string | null) => void;
  setIsStreaming: (v: boolean) => void;
};

export function useChatStream(opts: UseChatStreamOpts) {
  const { selectedModel, systemPrompt, temperature, maxTokens, streamEnabled, messages, setMessages, setLastMeta, setError, setIsStreaming } = opts;
  const abortRef = useRef<AbortController | null>(null);
  const throttleRef = useRef<{ pending: string; raf: number | null; targetId: string | null; provider?: string; modelHeader?: string }>({ pending: "", raf: null, targetId: null });

  // Cleanup on unmount — prevents leaked fetch + setState on unmounted
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (throttleRef.current.raf) cancelAnimationFrame(throttleRef.current.raf);
    };
  }, []);

  const flushThrottle = useCallback(() => {
    const t = throttleRef.current;
    if (!t.pending || !t.targetId) return;
    const toApply = t.pending;
    const targetId = t.targetId;
    const provider = t.provider;
    const modelHeader = t.modelHeader;
    t.pending = "";
    t.raf = null;
    setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: (m.content || "") + toApply, provider, model: modelHeader } : m)));
    // We store full separately and flush via RAF batching; provider/model already set
  }, [setMessages]);

  const scheduleFlush = useCallback((delta: string, targetId: string, provider?: string, modelHeader?: string) => {
    const t = throttleRef.current;
    t.pending += delta;
    t.targetId = targetId;
    t.provider = provider;
    t.modelHeader = modelHeader;
    if (t.raf == null) {
      t.raf = requestAnimationFrame(() => {
        flushThrottle();
      });
    }
  }, [flushThrottle]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async (inputText: string, pendingAttachments: ChatMessage["attachments"], clearComposer: () => void) => {
    const rawText = inputText.trim();
    if (!rawText && (!pendingAttachments || pendingAttachments.length === 0)) return;
    // Prevent concurrent sends
    if (abortRef.current) return;
    setError(null);

    let finalText = rawText;
    const textFiles = (pendingAttachments || []).filter((a) => a.type === "text");
    if (textFiles.length) {
      finalText += (finalText ? "\n\n" : "") + textFiles.map((f) => `File: ${f.name}\n\`\`\`markdown\n${f.text}\n\`\`\``).join("\n\n");
    }
    const imageAttachments = (pendingAttachments || []).filter((a) => a.type === "image");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: finalText || (imageAttachments.length ? "(image)" : ""),
      attachments: pendingAttachments?.length ? [...pendingAttachments] : undefined,
      createdAt: new Date().toISOString(),
    };
    const assistantId = `a-${Date.now()}`;
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      model: selectedModel,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    clearComposer();
    setIsStreaming(true);

    const mk = getMasterKey();
    if (!mk) {
      setError("Missing MASTER key — set it in header (localStorage.masterKey) or via /api/bootstrap");
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "**Error:** Missing MASTER key", error: "missing key" } : m)));
      setIsStreaming(false);
      return;
    }

    const apiMessages: unknown[] = [];
    if (systemPrompt.trim()) apiMessages.push({ role: "system", content: systemPrompt.trim() });
    for (const m of [...messages, userMsg]) {
      if (m.id === "welcome" || m.id.startsWith("welcome-")) continue;
      const imgs = (m.attachments || []).filter((a) => a.type === "image" && a.dataUrl);
      if (imgs.length && m.role === "user") {
        const parts: unknown[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const im of imgs) parts.push({ type: "image_url", image_url: { url: im.dataUrl } });
        apiMessages.push({ role: m.role, content: parts });
      } else {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const body: Record<string, unknown> = {
      model: selectedModel,
      messages: apiMessages,
      temperature,
      max_tokens: maxTokens,
      stream: streamEnabled,
    };

    const controller = new AbortController();
    abortRef.current = controller;
    const start = Date.now();
    // Reset throttle buffer
    throttleRef.current.pending = "";
    throttleRef.current.targetId = assistantId;
    if (throttleRef.current.raf) { cancelAnimationFrame(throttleRef.current.raf); throttleRef.current.raf = null; }

    try {
      const res = await fetch(`/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mk}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let msg = txt;
        try {
          const j = JSON.parse(txt);
          msg = j.error?.message || j.error || txt;
        } catch {}
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const provider = res.headers.get("x-provider") || res.headers.get("X-Provider") || undefined;
      const modelHeader = res.headers.get("x-model") || res.headers.get("X-Model") || selectedModel;

      if (!streamEnabled || !res.body) {
        const data = (await res.json().catch(async () => ({ text: await res.text() }))) as Record<string, unknown>;
        const choices = data.choices as Array<Record<string, unknown>> | undefined;
        const rawChoice = choices?.[0];
        const rawMsg = rawChoice?.message as Record<string, unknown> | undefined;
        let content = "";
        if (rawMsg) {
          if (typeof rawMsg.content === "string") content = rawMsg.content as string;
          else if (Array.isArray(rawMsg.content)) content = (rawMsg.content as Array<Record<string, unknown>>).map((p) => (p.text as string) || (p.content as string) || "").join("");
          else if (rawMsg.content) content = String(rawMsg.content);
          if (!content && rawMsg.reasoning_content) content = String(rawMsg.reasoning_content);
          if (!content && rawMsg.reasoning) content = String(rawMsg.reasoning);
        }
        if (!content) content = (data.content as string) || (data.text as string) || (data.output_text as string) || "";
        if (!content) content = JSON.stringify(data, null, 2);
        const usage = data.usage as Record<string, unknown> | undefined;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: String(content), provider: (data.provider as string) || provider, model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, tokens: usage ? { prompt: usage.prompt_tokens as number, completion: usage.completion_tokens as number, total: usage.total_tokens as number } : undefined } : m)));
        setLastMeta({ provider: provider || (data.provider as string), model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, usage });
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let reasoningFull = "";
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
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
              const j = json as Record<string, unknown>;
              if (j.error) {
                const e = j.error as Record<string, unknown>;
                streamError = (e.message as string) || (e.error as string) || JSON.stringify(e);
                continue;
              }
              if (j.usage) setLastMeta((p) => ({ ...(p || {}), usage: j.usage as unknown }));
              const { content: deltaContent, reasoning } = extractDelta(json);
              if (reasoning && reasoning.startsWith("__ERROR__:")) {
                streamError = reasoning.slice("__ERROR__:".length);
                continue;
              }
              if (reasoning) reasoningFull += reasoning;
              if (deltaContent) {
                full += deltaContent;
                scheduleFlush(deltaContent, assistantId, provider, modelHeader);
              }
              if (j.usage) setLastMeta((p) => ({ ...(p || {}), usage: j.usage as unknown }));
            } catch {
              // ignore incomplete json
            }
          }
          if (streamError) break;
        }
        // Ensure any pending RAF is flushed
        if (throttleRef.current.raf) {
          cancelAnimationFrame(throttleRef.current.raf);
          throttleRef.current.raf = null;
        }
        if (throttleRef.current.pending) {
          const pending = throttleRef.current.pending;
          throttleRef.current.pending = "";
          full += ""; // full already aggregated via scheduleFlush pending; ensure sync
          // Apply pending directly (full already has it via scheduleFlush? we used scheduleFlush to batch. Need to ensure full reflects pending. Instead flush to state)
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + pending, provider, model: modelHeader } : m)));
        }
        // flush leftover buffer
        if (!streamError && buffer.trim().startsWith("data:")) {
          const dataStr = buffer.trim().slice(5).trim();
          if (dataStr && dataStr !== "[DONE]") {
            try {
              const json = JSON.parse(dataStr);
              const { content: deltaContent, reasoning } = extractDelta(json);
              if (reasoning) reasoningFull += reasoning;
              if (deltaContent) {
                full += deltaContent;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + deltaContent, provider, model: modelHeader } : m)));
              }
            } catch {}
          }
        }
        if (streamError) throw new Error(streamError);
        // If only reasoning, show it
        // Need to check current content length; if empty use reasoningFull
        // We already flushed; if still empty, set reasoning
        setMessages((prev) => {
          const cur = prev.find((m) => m.id === assistantId);
          if (cur && !cur.content.trim() && reasoningFull.trim()) {
            return prev.map((m) => (m.id === assistantId ? { ...m, content: reasoningFull, provider, model: modelHeader } : m));
          }
          return prev;
        });
        // Determine if still empty after all
        const curContent = (() => {
          // optimistic: if full was aggregated via schedule, check full var
          // Also check reasoning fallback
          if (full.trim()) return full;
          if (reasoningFull.trim()) return reasoningFull;
          return "";
        })();
        if (!curContent.trim()) {
          // fallback to non-stream once
          try {
            const fallbackRes = await fetch(`/v1/chat/completions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${mk}`, "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, stream: false }),
            });
            if (fallbackRes.ok) {
              const data = await fallbackRes.json() as Record<string, unknown>;
              const fbChoices = (data.choices as Array<Record<string, unknown>> | undefined);
              const fbChoice = fbChoices?.[0]?.message as Record<string, unknown> | undefined;
              let fbContent = "";
              if (fbChoice) {
                if (typeof fbChoice.content === "string") fbContent = fbChoice.content as string;
                else if (Array.isArray(fbChoice.content)) fbContent = (fbChoice.content as Array<Record<string, unknown>>).map((p) => (p.text as string) || "").join("");
                if (!fbContent) fbContent = (fbChoice.reasoning_content as string) || (fbChoice.reasoning as string) || "";
              }
              if (!fbContent) fbContent = (data.content as string) || (data.text as string) || "";
              if (fbContent) {
                full = String(fbContent);
                const usage = data.usage as Record<string, unknown> | undefined;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full, provider: (data.provider as string) || provider, model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, tokens: usage ? { prompt: usage.prompt_tokens as number, completion: usage.completion_tokens as number, total: usage.total_tokens as number } : undefined } : m)));
                setLastMeta({ provider: provider || (data.provider as string), model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, usage });
              } else {
                throw new Error("Empty response (stream and fallback both empty). Try different model or increase Max Tokens.");
              }
            } else {
              const txt = await fallbackRes.text().catch(() => "");
              throw new Error(txt.slice(0, 300) || "Empty stream — fallback failed");
            }
          } catch (fbErr: unknown) {
            const msg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            if (msg.includes("Empty response")) throw fbErr;
            throw new Error("Empty response from model (stream returned no content). " + (msg || "Try non-stream or different model / increase Max Tokens."));
          }
        } else {
          const latency = Date.now() - start;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, latencyMs: latency } : m)));
          setLastMeta((p) => ({ ...(p || {}), provider, model: modelHeader, latencyMs: latency }));
        }
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AbortError") {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || "(stopped)", error: "stopped" } : m)));
      } else {
        const msg = err.message || String(e);
        setError(msg.slice(0, 800));
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: msg ? `**Error:** ${msg}` : m.content, error: msg } : m)));
      }
    } finally {
      if (throttleRef.current.raf) { cancelAnimationFrame(throttleRef.current.raf); throttleRef.current.raf = null; }
      throttleRef.current.pending = "";
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, selectedModel, systemPrompt, temperature, maxTokens, streamEnabled, setMessages, setLastMeta, setError, setIsStreaming, scheduleFlush]);

  return { handleSend, handleStop, abortRef };
}
