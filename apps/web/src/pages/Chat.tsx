import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Send,
  RotateCcw,
  Copy,
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
import { useLang } from "../lib/i18n.tsx";
import { MarkdownContent } from "../features/chat/components/MarkdownContent";
import {
  ALLOWED_CHAT_MODELS as _ALLOWED,
  ALLOWED_SET as _ALLOWED_SET,
  FALLBACK_CONTEXT as _FALLBACK,
} from "../features/chat/types";
import type { Attachment, ChatMessage, ModelEntry } from "../features/chat/types";
import { estimateMessageTokens, estimateTokens } from "../features/chat/lib/token";
import { loadMessages, persistMessages, clearPersistedMessages, prefs, getMasterKey } from "../features/chat/lib/storage";
import { useChatStream } from "../features/chat/hooks/useChatStream";
import { useChatAttachments } from "../features/chat/hooks/useChatAttachments";

// Re-export for backwards compat + tests that grep this file
export const ALLOWED_CHAT_MODELS = _ALLOWED;
export type AllowedChatModel = (typeof _ALLOWED)[number];
const ALLOWED_SET = _ALLOWED_SET;
const FALLBACK_CONTEXT = _FALLBACK;

export default function Chat() {
  const { t } = useLang();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadMessages({
      id: "welcome",
      role: "assistant",
      content: t("chat.welcome"),
      createdAt: new Date().toISOString(),
    }),
  );
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => prefs.getModel(_ALLOWED[1], ALLOWED_SET));
  const [temperature, setTemperature] = useState(() => prefs.getTemp());
  const [maxTokens, setMaxTokens] = useState(() => prefs.getMaxTokens());
  const [streamEnabled, setStreamEnabled] = useState(() => prefs.getStream());
  const [systemPrompt, setSystemPrompt] = useState(() => prefs.getSystem());
  const [showSettings, setShowSettings] = useState(false);
  const [modelSearchOpen, setModelSearchOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [lastMeta, setLastMeta] = useState<{ provider?: string; model?: string; latencyMs?: number; usage?: unknown } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const scrollToMessage = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId((prev) => (prev === id ? null : prev)), 2000);
    }
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Persist messages (debounced via microtask)
  useEffect(() => {
    const id = setTimeout(() => persistMessages(messages), 200);
    return () => clearTimeout(id);
  }, [messages]);

  useEffect(() => prefs.setModel(selectedModel), [selectedModel]);
  useEffect(() => prefs.setTemp(temperature), [temperature]);
  useEffect(() => prefs.setMaxTokens(maxTokens), [maxTokens]);
  useEffect(() => prefs.setStream(streamEnabled), [streamEnabled]);
  useEffect(() => prefs.setSystem(systemPrompt), [systemPrompt]);

  // Fetch models — restrict to ALLOWED_CHAT_MODELS only
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/v1/models?limit=1000`, { headers: { Authorization: `Bearer ${getMasterKey()}` }, signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.data || []) as ModelEntry[];
        const filtered: ModelEntry[] = _ALLOWED.map((id) => {
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
        const fallback: ModelEntry[] = _ALLOWED.map((id) => ({
          id,
          owned_by: id.split("/")[0],
          context_length: FALLBACK_CONTEXT[id] || 128000,
          live_status: "alias",
        }));
        setModels(fallback);
      });
    return () => ac.abort();
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, isStreaming, scrollToBottom]);

  // Throttled auto-scroll while streaming — RAF instead of setInterval
  useEffect(() => {
    if (!isStreaming) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 250) {
        scrollToBottom(true);
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isStreaming, scrollToBottom]);

  const selectedModelInfo = useMemo(() => models.find((m) => m.id === selectedModel), [models, selectedModel]);
  const contextLimit = selectedModelInfo?.context_length || FALLBACK_CONTEXT[selectedModel] || 128000;
  const effectiveContext = contextLimit;

  const totalPromptTokens = useMemo(() => {
    let sum = 0;
    for (const m of messages) sum += estimateMessageTokens(m);
    if (systemPrompt) sum += estimateTokens(systemPrompt) + 4;
    return sum;
  }, [messages, systemPrompt]);
  const ctxPercent = useMemo(() => Math.min(100, Math.round((totalPromptTokens / effectiveContext) * 100)), [totalPromptTokens, effectiveContext]);
  const ctxColor = ctxPercent > 90 ? "bg-rose-500" : ctxPercent > 70 ? "bg-amber-500" : ctxPercent > 50 ? "bg-blue-500" : "bg-emerald-500";

  const { handleFiles, removeAttachment, clearAttachments } = useChatAttachments(setPendingAttachments, setError, t);

  const { handleSend: sendStream, handleStop } = useChatStream({
    selectedModel,
    systemPrompt,
    temperature,
    maxTokens,
    streamEnabled,
    messages,
    setMessages,
    setLastMeta,
    setError,
    setIsStreaming,
  });

  const handleSend = useCallback(() => {
    sendStream(input, pendingAttachments, () => {
      setInput("");
      clearAttachments();
    });
  }, [sendStream, input, pendingAttachments, clearAttachments]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
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
    },
    [handleFiles],
  );

  const handleRefresh = useCallback(() => {
    if (isStreaming) handleStop();
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: t("chat.refreshed"),
        createdAt: new Date().toISOString(),
      },
    ]);
    setLastMeta(null);
    setError(null);
    clearAttachments();
    setInput("");
    clearPersistedMessages();
  }, [isStreaming, handleStop, t, clearAttachments]);

  const filteredModels = useMemo(
    () =>
      models
        .filter((m) => !modelFilter || m.id.toLowerCase().includes(modelFilter.toLowerCase()) || m.owned_by.toLowerCase().includes(modelFilter.toLowerCase()))
        .slice(0, 120),
    [models, modelFilter],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)] lg:h-[calc(100vh-132px)]">
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
                      onClick={() => navigator.clipboard.writeText(m.content).catch(() => {})}
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
            <button onClick={clearAttachments} className="ml-auto text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> {t("chat.clear")}
            </button>
          </div>
        )}

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

      <div className={`${drawerOpen ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-[360px] shrink-0 gap-4 overflow-y-auto`}>
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

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> {t("chat.breakdown")}
              </div>
              <div className="max-h-[160px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {messages.slice(-10).map((m) => (
                  <div
                    key={m.id}
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
                  {(lastMeta.usage as Record<string, unknown>) && (
                    <>
                      <div>
                        <div className="text-slate-400">prompt</div>
                        <div className="text-emerald-300">{(lastMeta.usage as Record<string, unknown>).prompt_tokens as string ?? (lastMeta.usage as Record<string, unknown>).promptTokens as string ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">completion</div>
                        <div className="text-amber-300">{(lastMeta.usage as Record<string, unknown>).completion_tokens as string ?? (lastMeta.usage as Record<string, unknown>).completionTokens as string ?? "—"}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

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

      {drawerOpen && <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}
