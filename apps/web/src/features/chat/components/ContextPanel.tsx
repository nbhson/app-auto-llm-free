import React from "react";
import { BarChart3, RotateCcw, Cpu, Clock, Zap, FileText, Sparkles } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import { estimateMessageTokens, estimateTokens } from "../lib/token";
import type { ChatMessage, ModelEntry } from "../types";

type Props = {
  messages: ChatMessage[];
  systemPrompt: string;
  selectedModel: string;
  selectedModelInfo: ModelEntry | undefined;
  effectiveContext: number;
  totalPromptTokens: number;
  ctxPercent: number;
  ctxColor: string;
  lastMeta: { provider?: string; model?: string; latencyMs?: number; usage?: unknown } | null;
  highlightedId: string | null;
  onScrollToMessage: (id: string) => void;
  onRefresh: () => void;
};

export const ContextPanel = React.memo(function ContextPanel({
  messages,
  systemPrompt,
  selectedModel,
  selectedModelInfo,
  effectiveContext,
  totalPromptTokens,
  ctxPercent,
  ctxColor,
  lastMeta,
  highlightedId,
  onScrollToMessage,
  onRefresh,
}: Props) {
  const { t } = useLang();
  const usage = lastMeta?.usage as Record<string, unknown> | undefined;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-700" /> {t("chat.contextWindow")}
        </h2>
        <button aria-label="Refresh conversation" onClick={onRefresh} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200" title="Refresh (clear chat)">
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
          <div className="h-2.5 rounded-full bg-slate-100 border border-slate-200 overflow-hidden p-0.5" role="progressbar" aria-valuenow={ctxPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Context usage">
            <div className={`h-full rounded-full transition-all duration-500 ${ctxColor}`} style={{ width: `${ctxPercent}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={`font-bold ${ctxPercent > 90 ? "text-rose-600" : ctxPercent > 70 ? "text-amber-600" : "text-emerald-600"}`}>{ctxPercent}% {t("chat.used")}</span>
            <span className="text-slate-500">{effectiveContext - totalPromptTokens > 0 ? `${(effectiveContext - totalPromptTokens).toLocaleString()} ${t("chat.left")}` : t("chat.full")}</span>
          </div>
          {ctxPercent > 85 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" role="warning">{t("chat.contextFullWarning")}</div>}
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
                onClick={() => onScrollToMessage(m.id)}
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
              {usage && (
                <>
                  <div>
                    <div className="text-slate-400">prompt</div>
                    <div className="text-emerald-300">{String(usage.prompt_tokens ?? usage.promptTokens ?? "—")}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">completion</div>
                    <div className="text-amber-300">{String(usage.completion_tokens ?? usage.completionTokens ?? "—")}</div>
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
          onClick={onRefresh}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-sm"
        >
          <RotateCcw className="w-4 h-4" /> {t("chat.refreshFromStart")}
        </button>
        <p className="text-center text-[11px] text-slate-400">{t("chat.noMultiSession")}</p>
      </div>
    </div>
  );
});

export const TipsCard = React.memo(function TipsCard() {
  const { t } = useLang();
  return (
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
  );
});
