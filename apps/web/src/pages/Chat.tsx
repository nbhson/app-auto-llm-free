import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Send,
  RotateCcw,
  Copy,
  Check,
  Image as ImageIcon,
  FileText,
  Trash2,
  Bot,
  User,
  Settings2,
  Cpu,
  BarChart3,
  Clock,
  Zap,
  StopCircle,
  Paperclip,
  ChevronDown,
  X,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { useLang } from "../lib/i18n.tsx";

// Types
type Attachment = {
  id: string;
  name: string;
  type: "image" | "text";
  size: number;
  dataUrl?: string; // for images
  text?: string; // for md/txt
  preview?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  error?: string;
};

type ModelEntry = {
  id: string;
  owned_by: string;
  context_length?: number;
  score?: number;
  live_status?: string;
};

/** Allowed chat models — strict 6 per product requirement (added free-llm-gateway/auto) */
export const ALLOWED_CHAT_MODELS = [
  "free-llm-gateway/auto",
  "kilo-code/kilo-auto/free",
  "kilo-code/auto",
  "openrouter/auto",
  "kiraai/kira-auto",
  "agnes-ai/agnes-2.5-flash",
] as const;
export type AllowedChatModel = (typeof ALLOWED_CHAT_MODELS)[number];
const ALLOWED_SET = new Set<string>(ALLOWED_CHAT_MODELS as readonly string[]);
const FALLBACK_CONTEXT: Record<string, number> = {
  "free-llm-gateway/auto": 128000,
  "kilo-code/kilo-auto/free": 262000,
  "kilo-code/auto": 262000,
  "openrouter/auto": 262144,
  "kiraai/kira-auto": 128000,
  "agnes-ai/agnes-2.5-flash": 256000,
};

function mk() {
  return localStorage.getItem("masterKey") || "fgk-master-dev-key";
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(m: ChatMessage): number {
  let t = estimateTokens(m.content) + 4;
  if (m.attachments) {
    for (const a of m.attachments) {
      if (a.type === "image") t += 258; // rough vision token
      else if (a.text) t += estimateTokens(a.text);
    }
  }
  return t;
}

// Markdown code block with copy
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");
  const langMatch = /language-(\w+)/.exec(className || "");
  const lang = langMatch ? langMatch[1] : "";
  const isInline = !className;

  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[13px] font-mono text-slate-800">
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-3 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 border-b border-slate-200">
        <span className="text-xs font-mono font-semibold text-slate-600">{lang || t("chat.code")}</span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? t("chat.copied") : t("chat.copy")}
        </button>
      </div>
      <pre className="p-0 m-0 overflow-x-auto">
        <code className={`${className || ""} block p-4 text-[13px] leading-6 !bg-transparent`} style={{ background: "transparent" }}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-slate max-w-none prose-sm prose-p:leading-7 prose-a:text-blue-600 prose-a:underline-offset-2 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // @ts-ignore - types mismatch
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[13px] font-mono text-slate-800" {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre: ({ children }: any) => <>{children}</>,
          a: ({ children, ...props }: any) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">
              {children}
            </a>
          ),
          table: ({ children }: any) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }: any) => <th className="bg-slate-50 px-3 py-2 text-left text-xs font-bold border-b border-slate-200">{children}</th>,
          td: ({ children }: any) => <td className="px-3 py-2 border-b border-slate-100 text-sm">{children}</td>,
          blockquote: ({ children }: any) => <blockquote className="border-l-4 border-slate-200 pl-4 italic text-slate-600 my-3">{children}</blockquote>,
          ul: ({ children }: any) => <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>,
          ol: ({ children }: any) => <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>,
          h1: ({ children }: any) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }: any) => <h2 className="text-lg font-bold mt-4 mb-2">{children}</h2>,
          h3: ({ children }: any) => <h3 className="text-base font-bold mt-3 mb-1.5">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function Chat() {
  const { t } = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem("chatMessages");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return [
      {
        id: "welcome",
        role: "assistant",
        content:
          t("chat.welcome"),
        createdAt: new Date().toISOString(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem("chatSelectedModel");
    if (saved && ALLOWED_SET.has(saved)) return saved;
    return ALLOWED_CHAT_MODELS[1]; // default kilo-code/auto
  });
  const [temperature, setTemperature] = useState(() => parseFloat(localStorage.getItem("chatTemp") || "0.7"));
  const [maxTokens, setMaxTokens] = useState(() => parseInt(localStorage.getItem("chatMaxTokens") || "4096", 10));
  const [streamEnabled, setStreamEnabled] = useState(() => localStorage.getItem("chatStream") !== "0");
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem("chatSystemPrompt") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [modelSearchOpen, setModelSearchOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [lastMeta, setLastMeta] = useState<{ provider?: string; model?: string; latencyMs?: number; usage?: any } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const scrollToMessage = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      // highlight for 2s then clear
      setTimeout(() => setHighlightedId((prev) => (prev === id ? null : prev)), 2000);
    }
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Persist messages lightly
  useEffect(() => {
    try {
      // avoid persisting too large (images)
      const toStore = messages.map((m) => ({
        ...m,
        attachments: m.attachments?.map((a) => (a.type === "image" ? { ...a, dataUrl: a.dataUrl?.slice(0, 2000) + "..." } : a)),
      }));
      // store only last 30 without heavy data
      localStorage.setItem("chatMessages", JSON.stringify(messages.slice(-30)));
      localStorage.setItem("chatMessages_full", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => localStorage.setItem("chatSelectedModel", selectedModel), [selectedModel]);
  useEffect(() => localStorage.setItem("chatTemp", String(temperature)), [temperature]);
  useEffect(() => localStorage.setItem("chatMaxTokens", String(maxTokens)), [maxTokens]);
  useEffect(() => localStorage.setItem("chatStream", streamEnabled ? "1" : "0"), [streamEnabled]);
  useEffect(() => localStorage.setItem("chatSystemPrompt", systemPrompt), [systemPrompt]);

  // Fetch models — restrict to ALLOWED_CHAT_MODELS only
  useEffect(() => {
    fetch(`/v1/models?limit=1000`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.data || []) as ModelEntry[];
        // map allowed -> enriched entry if exists else fallback
        const filtered: ModelEntry[] = ALLOWED_CHAT_MODELS.map((id) => {
          const found = list.find((m) => m.id === id);
          if (found) return found;
          return {
            id,
            owned_by: id.split("/")[0],
            context_length: FALLBACK_CONTEXT[id] || 128000,
            score: 70,
            live_status: "alias",
          };
        });
        setModels(filtered);
      })
      .catch(() => {
        const fallback: ModelEntry[] = ALLOWED_CHAT_MODELS.map((id) => ({
          id,
          owned_by: id.split("/")[0],
          context_length: FALLBACK_CONTEXT[id] || 128000,
          live_status: "alias",
        }));
        setModels(fallback);
      });
  }, []);

  // Auto scroll bottom
  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, isStreaming]);

  // Also scroll when streaming chunk updates via interval
  useEffect(() => {
    if (isStreaming) {
      const id = setInterval(() => scrollToBottom(true), 300);
      return () => clearInterval(id);
    }
  }, [isStreaming, scrollToBottom]);

  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const contextLimit = selectedModelInfo?.context_length || FALLBACK_CONTEXT[selectedModel] || 128000;
  const effectiveContext = contextLimit;

  const totalPromptTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0) + (systemPrompt ? estimateTokens(systemPrompt) + 4 : 0);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const ctxPercent = Math.min(100, Math.round((totalPromptTokens / effectiveContext) * 100));
  const ctxColor = ctxPercent > 90 ? "bg-rose-500" : ctxPercent > 70 ? "bg-amber-500" : ctxPercent > 50 ? "bg-blue-500" : "bg-emerald-500";

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const f of arr) {
      const isImage = f.type.startsWith("image/");
      const isText = f.name.endsWith(".md") || f.name.endsWith(".txt") || f.name.endsWith(".markdown") || f.type === "text/plain" || f.type === "text/markdown";
      if (!isImage && !isText) {
        // fallback treat as text if small
        if (f.size > 2 * 1024 * 1024) {
          setError(t("chat.errorFileNotSupported").replace("{name}", f.name));
          continue;
        }
      }
      if (isImage) {
        if (f.size > 6 * 1024 * 1024) {
          setError(t("chat.errorImageTooLarge").replace("{name}", f.name));
          continue;
        }
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        setPendingAttachments((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), name: f.name, type: "image", size: f.size, dataUrl, preview: dataUrl },
        ]);
      } else {
        if (f.size > 1 * 1024 * 1024) {
          setError(t("chat.errorFileTooLarge").replace("{name}", f.name));
          continue;
        }
        const text: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsText(f);
        });
        // truncate 50k chars
        const truncated = text.slice(0, 50000);
        setPendingAttachments((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), name: f.name, type: "text", size: f.size, text: truncated },
        ]);
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const handleSend = async () => {
    const rawText = input.trim();
    if (!rawText && pendingAttachments.length === 0) return;
    if (isStreaming) return;
    setError(null);

    // Build final user content with text files
    let finalText = rawText;
    const textFiles = pendingAttachments.filter((a) => a.type === "text");
    if (textFiles.length) {
      finalText += (finalText ? "\n\n" : "") + textFiles.map((f) => `File: ${f.name}\n\`\`\`markdown\n${f.text}\n\`\`\``).join("\n\n");
    }
    const imageAttachments = pendingAttachments.filter((a) => a.type === "image");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: finalText || (imageAttachments.length ? "(image)" : ""),
      attachments: pendingAttachments.length ? [...pendingAttachments] : undefined,
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

    const newMessages = [...messages, userMsg, placeholder];
    setMessages(newMessages);
    setInput("");
    setPendingAttachments([]);
    setIsStreaming(true);

    // Prepare API messages
    const apiMessages: any[] = [];
    if (systemPrompt.trim()) apiMessages.push({ role: "system", content: systemPrompt.trim() });
    for (const m of [...messages, userMsg]) {
      // skip welcome if it's first assistant and we have real history? keep it as system context? but skip for cleaner
      if (m.id === "welcome") continue;
      const imgs = (m.attachments || []).filter((a) => a.type === "image" && a.dataUrl);
      if (imgs.length && m.role === "user") {
        const parts: any[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const im of imgs) parts.push({ type: "image_url", image_url: { url: im.dataUrl } });
        apiMessages.push({ role: m.role, content: parts });
      } else {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const body: any = {
      model: selectedModel,
      messages: apiMessages,
      temperature,
      max_tokens: maxTokens,
      stream: streamEnabled,
    };

    const controller = new AbortController();
    abortRef.current = controller;
    const start = Date.now();

    try {
      const res = await fetch(`/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" },
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
        const data = await res.json();
        // robust non-stream content extraction (array content, reasoning fallback)
        const rawChoice = data.choices?.[0];
        const rawMsg = rawChoice?.message;
        let content: string = "";
        if (rawMsg) {
          if (typeof rawMsg.content === "string") content = rawMsg.content;
          else if (Array.isArray(rawMsg.content)) content = rawMsg.content.map((p: any) => p.text || p.content || "").join("");
          else if (rawMsg.content) content = String(rawMsg.content);
          if (!content && rawMsg.reasoning_content) content = String(rawMsg.reasoning_content);
          if (!content && rawMsg.reasoning) content = String(rawMsg.reasoning);
        }
        if (!content) content = data.content || data.text || data.output_text || "";
        if (!content) content = JSON.stringify(data, null, 2);
        const usage = data.usage;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: String(content), provider: data.provider || provider, model: data.model || modelHeader, latencyMs: Date.now() - start, tokens: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens } : undefined } : m)));
        setLastMeta({ provider: provider || data.provider, model: data.model || modelHeader, latencyMs: Date.now() - start, usage });
      } else {
        // robust streaming parse — handles reasoning_content/reasoning/thinking/text variants + empty fallback
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        let reasoningFull = "";
        let streamError: string | null = null;
        const extractDelta = (json: any): { content: string; reasoning: string } => {
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
              // array content (OpenAI multi-part)
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
        };
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
              if (json.error) {
                streamError = json.error.message || json.error.error || JSON.stringify(json.error);
                continue;
              }
              if (json.usage) setLastMeta((p) => ({ ...(p || {}), usage: json.usage }));
              const { content: deltaContent, reasoning } = extractDelta(json);
              if (reasoning && reasoning.startsWith("__ERROR__:")) {
                streamError = reasoning.slice("__ERROR__:".length);
                continue;
              }
              if (reasoning) reasoningFull += reasoning;
              if (deltaContent) {
                full += deltaContent;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full, provider, model: modelHeader } : m)));
              }
              if (json.usage) setLastMeta((p) => ({ ...(p || {}), usage: json.usage }));
            } catch {
              // ignore incomplete json
            }
          }
          if (streamError) break;
        }
        // flush leftover buffer (single data line without trailing newline)
        if (!streamError && buffer.trim().startsWith("data:")) {
          const dataStr = buffer.trim().slice(5).trim();
          if (dataStr && dataStr !== "[DONE]") {
            try {
              const json = JSON.parse(dataStr);
              const { content: deltaContent, reasoning } = extractDelta(json);
              if (reasoning) reasoningFull += reasoning;
              if (deltaContent) {
                full += deltaContent;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full, provider, model: modelHeader } : m)));
              }
            } catch {}
          }
        }
        if (streamError) throw new Error(streamError);
        if (!full.trim() && reasoningFull.trim()) {
          // model only returned reasoning (common for thinking models on refactor) — show it instead of empty
          full = reasoningFull;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full, provider, model: modelHeader } : m)));
        }
        if (!full.trim()) {
          // empty stream -> fallback to non-stream once so user still gets answer
          try {
            const fallbackRes = await fetch(`/v1/chat/completions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, stream: false }),
            });
            if (fallbackRes.ok) {
              const data = await fallbackRes.json();
              const fbChoice = data.choices?.[0]?.message;
              let fbContent = "";
              if (fbChoice) {
                if (typeof fbChoice.content === "string") fbContent = fbChoice.content;
                else if (Array.isArray(fbChoice.content)) fbContent = fbChoice.content.map((p: any) => p.text || "").join("");
                if (!fbContent) fbContent = fbChoice.reasoning_content || fbChoice.reasoning || "";
              }
              if (!fbContent) fbContent = data.content || data.text || "";
              if (fbContent) {
                full = String(fbContent);
                const usage = data.usage;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: full, provider: data.provider || provider, model: data.model || modelHeader, latencyMs: Date.now() - start, tokens: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens } : undefined } : m)));
                setLastMeta({ provider: provider || data.provider, model: data.model || modelHeader, latencyMs: Date.now() - start, usage });
              } else {
                throw new Error("Empty response (stream and fallback both empty). Try different model or increase Max Tokens.");
              }
            } else {
              const txt = await fallbackRes.text().catch(() => "");
              throw new Error(txt.slice(0, 300) || "Empty stream — fallback failed");
            }
          } catch (fbErr: any) {
            if (fbErr.message?.includes("Empty response")) throw fbErr;
            throw new Error("Empty response from model (stream returned no content). " + (fbErr.message || "Try non-stream or different model / increase Max Tokens."));
          }
        }
        if (full.trim()) {
          const latency = Date.now() - start;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, latencyMs: latency } : m)));
          setLastMeta((p) => ({ ...(p || {}), provider, model: modelHeader, latencyMs: latency }));
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || "(stopped)", error: "stopped" } : m)));
      } else {
        const msg = e.message || String(e);
        setError(msg.slice(0, 800));
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: msg ? `**Error:** ${msg}` : m.content, error: msg } : m)));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRefresh = () => {
    if (isStreaming) handleStop();
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          t("chat.refreshed"),
        createdAt: new Date().toISOString(),
      },
    ]);
    setLastMeta(null);
    setError(null);
    setPendingAttachments([]);
    setInput("");
    try {
      localStorage.removeItem("chatMessages");
    } catch {}
  };

  const removeAttachment = (id: string) => setPendingAttachments((prev) => prev.filter((a) => a.id !== id));

  const filteredModels = models.filter((m) => !modelFilter || m.id.toLowerCase().includes(modelFilter.toLowerCase()) || m.owned_by.toLowerCase().includes(modelFilter.toLowerCase())).slice(0, 120);

  // keyboard: Enter to send
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)] lg:h-[calc(100vh-132px)]">
      {/* Main chat column */}
      <div
        className={`flex-1 flex flex-col min-w-0 bg-white rounded-xl border shadow-sm overflow-hidden ${isDragging ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50/20" : "border-slate-200"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-slate-900 leading-none">{t("chat.title")}</div>
              <div className="text-xs text-slate-500">{models.length} {t("chat.model").toLowerCase()}s • gateway proxy</div>
            </div>
          </div>

          {/* Model selector */}
          <div className="relative flex-1 max-w-[420px] ml-2">
            <button
              onClick={() => setModelSearchOpen(!modelSearchOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium hover:bg-slate-50 text-left"
            >
              <Cpu className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate font-mono text-xs flex-1">{selectedModel}</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-mono">
                {effectiveContext >= 1000000 ? `${Math.round(effectiveContext / 1000000)}M` : `${Math.round(effectiveContext / 1000)}K`}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${modelSearchOpen ? "rotate-180" : ""}`} />
            </button>
            {modelSearchOpen && (
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 z-30 overflow-hidden">
                <div className="p-2 border-b border-slate-100">
                  <input
                    autoFocus
                    placeholder={t("chat.filterModel")}
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {filteredModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setModelSearchOpen(false);
                        setModelFilter("");
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0 ${m.id === selectedModel ? "bg-slate-900 text-white hover:bg-slate-800" : ""}`}
                    >
                      <span className="font-mono text-xs flex-1 truncate">{m.id}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${m.id === selectedModel ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                        {m.context_length ? (m.context_length >= 1000000 ? `${m.context_length / 1000000}M` : `${Math.round(m.context_length / 1000)}K`) : "—"}
                      </span>
                    </button>
                  ))}
                  {filteredModels.length === 0 && <div className="p-4 text-center text-sm text-slate-400">{t("chat.noMatch")}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="lg:hidden p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
              title="Context window"
            >
              <BarChart3 className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg border ${showSettings ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"}`}
              title="Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
              title="Refresh conversation"
            >
              <RotateCcw className="w-4 h-4" /> <span className="hidden sm:inline">{t("chat.refresh")}</span>
            </button>
          </div>
        </div>

        {/* Settings bar */}
        {showSettings && (
          <div className="px-3 py-3 border-b border-slate-200 bg-amber-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">{t("chat.temperature")} {temperature}</span>
                <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-slate-900" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">{t("chat.maxTokens")}</span>
                <input type="number" min={64} max={8192} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1024)} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={streamEnabled} onChange={(e) => setStreamEnabled(e.target.checked)} className="w-4 h-4 accent-slate-900" />
                <span className="text-xs font-semibold text-slate-700">{t("chat.streaming")}</span>
                <span className="text-xs text-slate-500">(SSE)</span>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">{t("chat.systemPrompt")}</span>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder={t("chat.systemPromptPlaceholder")} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none" />
            </label>
          </div>
        )}

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4 bg-slate-50/30" onClick={() => setModelSearchOpen(false)}>
          {messages.map((m) => (
            <div key={m.id} id={`msg-${m.id}`} className={`flex gap-3 scroll-mt-4 transition-all duration-300 ${m.role === "user" ? "justify-end" : "justify-start"} ${highlightedId === m.id ? "ring-2 ring-amber-400 rounded-2xl" : ""}`}>
              {m.role !== "user" && (
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`max-w-[92%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === "user" ? "bg-slate-900 text-white rounded-br-md" : "bg-white border border-slate-200 shadow-sm rounded-bl-md"} ${m.error ? "border-rose-300 bg-rose-50" : ""}`}>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {m.attachments.map((a) => (
                      <div key={a.id} className={`${m.role === "user" ? "bg-white/10 border-white/20 text-white" : "bg-slate-50 border-slate-200"} border rounded-lg overflow-hidden`}>
                        {a.type === "image" && a.preview ? (
                          <div className="p-1">
                            <img src={a.preview} alt={a.name} className="max-h-40 rounded-lg border border-slate-200" />
                            <div className="text-[11px] font-mono px-1 pt-1 truncate max-w-[160px]">{a.name}</div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium">
                            <FileText className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[140px]">{a.name}</span>
                            <span className="text-[11px] opacity-70">{(a.size / 1024).toFixed(1)}KB</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {m.role === "assistant" ? (
                  m.content ? (
                    <MarkdownContent content={m.content} />
                  ) : isStreaming && m.id === messages[messages.length - 1]?.id ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" /> thinking...
                    </span>
                  ) : null
                ) : (
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                )}
                <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${m.role === "user" ? "text-slate-300 justify-end" : "text-slate-500"}`}>
                  <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                  {m.provider && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-mono">{m.provider}</span>}
                  {m.latencyMs && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{m.latencyMs}ms</span>}
                  {m.role === "assistant" && m.content && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(m.content);
                      }}
                      className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {m.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <span className="font-bold shrink-0">Error:</span>
            <span className="flex-1 break-all">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="px-3 py-2 border-t border-slate-200 bg-white flex flex-wrap gap-2">
            {pendingAttachments.map((a) => (
              <div key={a.id} className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium">
                {a.type === "image" ? <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> : <FileText className="w-3.5 h-3.5 text-amber-600" />}
                <span className="truncate max-w-[120px]">{a.name}</span>
                <span className="text-[11px] text-slate-500">{(a.size / 1024).toFixed(0)}KB</span>
                {a.type === "image" && a.preview && <img src={a.preview} alt={a.name} className="w-6 h-6 rounded object-cover border border-slate-200" />}
                <button onClick={() => removeAttachment(a.id)} className="p-1 rounded-full hover:bg-slate-200">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button onClick={() => setPendingAttachments([])} className="ml-auto text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> {t("chat.clear")}
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="p-3 border-t border-slate-200 bg-white shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => imageInputRef.current?.click()}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700"
                title="Upload image"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700"
                title="Upload md/txt"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown,text/markdown,text/plain" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={t("chat.placeholder")}
                rows={1}
                className="w-full min-h-[44px] max-h-[120px] px-3 py-3 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 resize-none text-sm leading-6 placeholder:text-slate-400"
                style={{ height: "44px" }}
                onInput={(e) => {
                  const ta = e.target as HTMLTextAreaElement;
                  ta.style.height = "44px";
                  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                }}
              />
              <span className="absolute right-3 bottom-3 text-[11px] text-slate-400 pointer-events-none hidden sm:block">{t("chat.sendHint")}</span>
            </div>
            {isStreaming ? (
              <button onClick={handleStop} className="p-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm">
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && pendingAttachments.length === 0}
                className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white shadow-sm transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>{t("chat.gatewayFallback")}</span>
            <span className="ml-auto hidden sm:inline">Context {totalPromptTokens.toLocaleString()} / {effectiveContext.toLocaleString()} tokens</span>
          </div>
        </div>
      </div>

      {/* Right context window panel - desktop */}
      <div className={`${drawerOpen ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-[360px] shrink-0 gap-4 overflow-y-auto`}>
        {/* Context window card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700" /> {t("chat.contextWindow")}
            </h2>
            <button onClick={handleRefresh} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200" title="Refresh (clear chat)">
              <RotateCcw className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {/* Model */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" /> {t("chat.model")}
                </span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">{selectedModelInfo?.live_status || "—"}</span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs truncate">{selectedModel}</div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>{t("chat.provider")}:</span>
                <span className="font-semibold text-slate-800">{lastMeta?.provider || selectedModel.split("/")[0] || "auto"}</span>
                {lastMeta?.latencyMs && <span className="ml-auto inline-flex items-center gap-1"><Clock className="w-3 h-3" />{lastMeta.latencyMs}ms</span>}
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{t("chat.tokens")}</span>
                <span className="font-mono text-slate-600">
                  {totalPromptTokens.toLocaleString()} / {effectiveContext.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 border border-slate-200 overflow-hidden p-0.5">
                <div className={`h-full rounded-full transition-all duration-500 ${ctxColor}`} style={{ width: `${ctxPercent}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className={`font-bold ${ctxPercent > 90 ? "text-rose-600" : ctxPercent > 70 ? "text-amber-600" : "text-emerald-600"}`}>{ctxPercent}% {t("chat.used")}</span>
                <span className="text-slate-500">{effectiveContext - totalPromptTokens > 0 ? `${(effectiveContext - totalPromptTokens).toLocaleString()} ${t("chat.left")}` : t("chat.full")}</span>
              </div>
              {ctxPercent > 85 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{t("chat.contextFullWarning")}</div>}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t("chat.messages")}</div>
                <div className="text-lg font-bold text-slate-900">{messages.length}</div>
                <div className="text-xs text-slate-500">{messages.filter((m) => m.role === "user").length} user • {messages.filter((m) => m.role === "assistant").length} assistant</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t("chat.estTokens")}</div>
                <div className="text-lg font-bold text-slate-900">{totalPromptTokens.toLocaleString()}</div>
                <div className="text-xs text-slate-500">prompt + history</div>
              </div>
            </div>

            {/* Per-message breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {t("chat.breakdown")}
              </div>
              <div className="max-h-[160px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {messages.slice(-10).map((m, idx) => (
                  <div
                    key={m.id + idx}
                    onClick={() => scrollToMessage(m.id)}
                    title={t("chat.breakdownHint")}
                    className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-amber-50 transition-colors ${highlightedId === m.id ? "bg-amber-100" : ""}`}
                  >
                    <span className={`w-16 shrink-0 font-semibold ${m.role === "user" ? "text-amber-700" : m.role === "system" ? "text-blue-700" : "text-slate-700"}`}>{m.role}</span>
                    <span className="flex-1 truncate text-slate-600">{m.content.slice(0, 60) || "(empty)"}</span>
                    <span className="font-mono text-slate-500">{estimateMessageTokens(m)}</span>
                  </div>
                ))}
                {systemPrompt && (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs bg-blue-50/50">
                    <span className="w-16 shrink-0 font-semibold text-blue-700">system</span>
                    <span className="flex-1 truncate text-slate-600">{systemPrompt.slice(0, 60)}</span>
                    <span className="font-mono text-slate-500">{estimateTokens(systemPrompt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Last response meta */}
            {lastMeta && (
              <div className="rounded-xl bg-slate-900 text-slate-100 p-3 space-y-1.5">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> {t("chat.lastResponse")}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <div className="text-slate-400">provider</div>
                    <div className="font-semibold text-white truncate">{lastMeta.provider || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">latency</div>
                    <div className="font-semibold text-white">{lastMeta.latencyMs ? `${lastMeta.latencyMs}ms` : "—"}</div>
                  </div>
                  {lastMeta.usage && (
                    <>
                      <div>
                        <div className="text-slate-400">prompt</div>
                        <div className="text-emerald-300">{lastMeta.usage.prompt_tokens ?? lastMeta.usage.promptTokens ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">completion</div>
                        <div className="text-amber-300">{lastMeta.usage.completion_tokens ?? lastMeta.usage.completionTokens ?? "—"}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Info like opencode window */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700">{t("chat.openCodeWindow")}</div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                <li>{t("chat.openCodeDesc1")}</li>
                <li>{t("chat.openCodeDesc2")}</li>
                <li>{t("chat.openCodeDesc3")}</li>
                <li>{t("chat.openCodeDesc4")}</li>
              </ul>
            </div>

            <button
              onClick={handleRefresh}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-sm"
            >
              <RotateCcw className="w-4 h-4" /> {t("chat.refreshFromStart")}
            </button>
            <p className="text-center text-[11px] text-slate-400">{t("chat.noMultiSession")}</p>
          </div>
        </div>

        {/* Tips card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-bold text-amber-900">{t("chat.tipsTitle")}</div>
              <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
                <li>{t("chat.tipsPaste")}</li>
                <li>{t("chat.tipsDrag")}</li>
                <li>{t("chat.tipsVision")}</li>
                <li>{t("chat.tipsAutoScroll")}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {drawerOpen && <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}
