import React, { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";

export const CodeBlock = React.memo(function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");
  const langMatch = /language-(\w+)/.exec(className || "");
  const lang = langMatch ? langMatch[1] : "";
  const isInline = !className;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[13px] font-mono text-slate-800">
        {children}
      </code>
    );
  }
  return (
    <div className="my-3 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 border-b border-slate-200">
        <span className="text-xs font-mono font-semibold text-slate-600">{lang || t("chat.code")}</span>
        <button
          aria-label={copied ? "Copied" : "Copy code"}
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
});
