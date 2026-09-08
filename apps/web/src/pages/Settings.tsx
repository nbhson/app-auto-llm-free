import React, { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, RotateCcw, Copy, Check, Info } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";

type SettingsState = {
  SEMANTIC_CACHE_ENABLED: number;
  SEMANTIC_THRESHOLD: number;
  CACHE_TTL_S: number;
  EMBEDDING_MODEL: string;
  EMBEDDING_FALLBACKS: string;
  COMPRESSION_ENABLED: number;
  COST_ROUTING_ENABLED: number;
  ANALYTICS_RETENTION_DAYS: number;
};

const STORAGE_KEY = "gatewaySettings";

const DEFAULTS: SettingsState = {
  SEMANTIC_CACHE_ENABLED: 0,
  SEMANTIC_THRESHOLD: 0.92,
  CACHE_TTL_S: 3600,
  EMBEDDING_MODEL: "cohere/embed-english-v3.0",
  EMBEDDING_FALLBACKS: "nvidia-nim/nvidia/nv-embed-v1,cloudflare-workers-ai/@cf/baai/bge-large-en-v1.5",
  COMPRESSION_ENABLED: 0,
  COST_ROUTING_ENABLED: 0,
  ANALYTICS_RETENTION_DAYS: 30,
};

function loadStored(): SettingsState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SettingsState;
  } catch {
    return null;
  }
}

function loadEnvDefaults(): SettingsState {
  return { ...DEFAULTS };
}

export default function Settings() {
  const { t } = useLang();
  const [form, setForm] = useState<SettingsState>(() => {
    const stored = loadStored();
    if (stored) return { ...DEFAULTS, ...stored };
    return loadEnvDefaults();
  });
  const [envDefaults, setEnvDefaults] = useState<SettingsState>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [source, setSource] = useState<".env" | "localStorage">(() => (loadStored() ? "localStorage" : ".env"));

  // Fetch .env defaults from backend on mount, merge if no localStorage override
  useEffect(() => {
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    fetch("/api/config", { headers: { Authorization: `Bearer ${key}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.SEMANTIC_CACHE_ENABLED === "undefined") return;
        const fetched: SettingsState = {
          SEMANTIC_CACHE_ENABLED: Number(d.SEMANTIC_CACHE_ENABLED) || 0,
          SEMANTIC_THRESHOLD: Number(d.SEMANTIC_THRESHOLD) || 0.92,
          CACHE_TTL_S: Number(d.CACHE_TTL_S) || 3600,
          EMBEDDING_MODEL: String(d.EMBEDDING_MODEL || DEFAULTS.EMBEDDING_MODEL).split(",")[0],
          EMBEDDING_FALLBACKS: String(d.EMBEDDING_FALLBACKS || DEFAULTS.EMBEDDING_FALLBACKS),
          COMPRESSION_ENABLED: Number(d.COMPRESSION_ENABLED) || 0,
          COST_ROUTING_ENABLED: Number(d.COST_ROUTING_ENABLED) || 0,
          ANALYTICS_RETENTION_DAYS: Number(d.ANALYTICS_RETENTION_DAYS) || 30,
        };
        setEnvDefaults(fetched);
        const stored = loadStored();
        if (!stored) {
          setForm(fetched);
          setSource(".env");
        } else {
          setSource("localStorage");
        }
      })
      .catch(() => {});
  }, []);

  const update = (patch: Partial<SettingsState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    setSource("localStorage");
    setIsDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setForm({ ...envDefaults });
    setSource(".env");
    setIsDirty(false);
  };

  const envSnippet = `SEMANTIC_CACHE_ENABLED=${form.SEMANTIC_CACHE_ENABLED}
SEMANTIC_THRESHOLD=${form.SEMANTIC_THRESHOLD}
CACHE_TTL_S=${form.CACHE_TTL_S}
EMBEDDING_MODEL=${form.EMBEDDING_MODEL}
EMBEDDING_FALLBACKS=${form.EMBEDDING_FALLBACKS}
COMPRESSION_ENABLED=${form.COMPRESSION_ENABLED}
COST_ROUTING_ENABLED=${form.COST_ROUTING_ENABLED}
ANALYTICS_RETENTION_DAYS=${form.ANALYTICS_RETENTION_DAYS}`;

  const handleCopyEnv = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-amber-500" : "bg-slate-300"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-slate-700" /> {t("settings.title") || "Settings"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("settings.subtitle") || "Gateway runtime flags. Defaults from .env, overrides stored in localStorage."}
          </p>
          <div className="mt-2 inline-flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${source === "localStorage" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {source === "localStorage" ? "localStorage" : ".env"} {source === "localStorage" ? t("settings.overridden") : t("settings.default")}
            </span>
            <span className="text-slate-400 hidden sm:inline">{t("settings.hint")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
            <RotateCcw className="w-3.5 h-3.5" /> {t("settings.reset") || "Reset to .env"}
          </button>
          <button onClick={handleSave} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold border shadow-xs ${isDirty ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800" : "bg-white text-slate-500 border-slate-200"}`}>
            {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? (t("settings.saved") || "Saved") : (t("settings.save") || "Save to localStorage")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Semantic Cache */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">{t("settings.semanticCache")}</h2>
          <p className="text-xs text-slate-500">{t("settings.enabledOnlyIf")}</p>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-semibold text-slate-800">{t("settings.semanticEnabled")}</div>
              <div className="text-xs text-slate-500">{t("settings.semanticEnabledDesc")}</div>
            </div>
            <Toggle checked={!!form.SEMANTIC_CACHE_ENABLED} onChange={(v) => update({ SEMANTIC_CACHE_ENABLED: v ? 1 : 0 })} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t("settings.threshold")} <span className="font-normal text-slate-500">(0.0-1.0)</span></label>
            <input type="number" step="0.01" min={0} max={1} value={form.SEMANTIC_THRESHOLD} onChange={(e) => update({ SEMANTIC_THRESHOLD: parseFloat(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            <p className="text-xs text-slate-400 mt-1">{t("settings.thresholdDesc")}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t("settings.ttl")}</label>
            <input type="number" min={60} value={form.CACHE_TTL_S} onChange={(e) => update({ CACHE_TTL_S: parseInt(e.target.value) || 3600 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            <p className="text-xs text-slate-400 mt-1">{t("settings.ttlDesc")}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t("settings.embeddingModel")}</label>
            <input type="text" value={form.EMBEDDING_MODEL} onChange={(e) => update({ EMBEDDING_MODEL: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" />
            <p className="text-xs text-slate-400 mt-1">{t("settings.embeddingFallbackDesc")}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">{t("settings.embeddingFallbacks")} <span className="font-normal text-slate-500">(comma-separated)</span></label>
            <input type="text" value={form.EMBEDDING_FALLBACKS} onChange={(e) => update({ EMBEDDING_FALLBACKS: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder="nvidia-nim/nvidia/nv-embed-v1,cloudflare-..." />
            <p className="text-xs text-slate-400 mt-1">{t("settings.embeddingFallbacksDesc")}</p>
          </div>
        </div>

        {/* Other flags */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">{t("settings.compressionRouting")}</h2>

            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <div className="text-sm font-semibold text-slate-800">{t("settings.compressionEnabled")}</div>
                <div className="text-xs text-slate-500">{t("settings.compressionDesc")}</div>
              </div>
              <Toggle checked={!!form.COMPRESSION_ENABLED} onChange={(v) => update({ COMPRESSION_ENABLED: v ? 1 : 0 })} />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">{t("settings.costEnabled")}</div>
                <div className="text-xs text-slate-500">{t("settings.costDesc")}</div>
              </div>
              <Toggle checked={!!form.COST_ROUTING_ENABLED} onChange={(v) => update({ COST_ROUTING_ENABLED: v ? 1 : 0 })} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">{t("settings.analytics")}</h2>
            <div>
              <label className="text-xs font-semibold text-slate-700">ANALYTICS_RETENTION_DAYS</label>
              <input type="number" min={1} max={365} value={form.ANALYTICS_RETENTION_DAYS} onChange={(e) => update({ ANALYTICS_RETENTION_DAYS: parseInt(e.target.value) || 30 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
              <p className="text-xs text-slate-400 mt-1">{t("settings.analyticsDesc")}</p>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <div className="font-bold">{t("settings.noteTitle")}</div>
                <p className="mt-1">{t("settings.noteDesc")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-slate-200">{t("settings.envSnippet")}</div>
          <button onClick={handleCopyEnv} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 hover:bg-slate-100">
            {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedEnv ? t("settings.copied") : t("settings.copy")}
          </button>
        </div>
        <pre className="text-xs font-mono text-emerald-200 whitespace-pre-wrap break-all bg-slate-800 rounded-lg p-3 border border-slate-700">{envSnippet}</pre>
      </div>
    </div>
  );
}
