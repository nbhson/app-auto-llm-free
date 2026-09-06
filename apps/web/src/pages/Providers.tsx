import { useEffect, useState } from "react";
import { Search, RefreshCw, ExternalLink, Copy, Check, Layers, ArrowUpDown } from "lucide-react";
import { getKeyUrl } from "../lib/getKeyUrls";
import { getBaseUrl } from "../lib/getBaseUrls";
import { useLang } from "../lib/i18n.tsx";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Providers() {
  const { t } = useLang();
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "free", dir: "desc" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [hasKeyOnly, setHasKeyOnly] = useState(() => {
    const v = localStorage.getItem("hasKeyOnly");
    if (v === null) { localStorage.setItem("hasKeyOnly", "1"); return true; }
    return v !== "0";
  });
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (qDebounced) params.set("q", qDebounced);
    if (hasKeyOnly) params.set("hasKey", "1");
    fetch(`/api/providers?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setData).catch(() => {});
  };
  const syncLive = async () => {
    if (!confirm("Sync Live sẽ gọi provider.models() bằng key thật để cập nhật live list, có thể mất 20s. Tiếp tục?")) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/models/live/sync`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" } });
      const data = await res.json().catch(() => null);
      await fetch(`/api/verify`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }) }).catch(() => {});
      alert(data ? `Sync xong: ${data.total} live models` : "Sync done");
      load();
    } catch (e: any) { alert("Sync failed: " + e.message); } finally { setSyncing(false); }
  };
  const checkHealth = () => {
    setLoadingHealth(true);
    fetch("/api/providers/health", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setHealth).finally(() => setLoadingHealth(false));
  };

  useEffect(() => { load(); }, [page, limit, qDebounced, hasKeyOnly]);
  useEffect(() => { localStorage.setItem("hasKeyOnly", hasKeyOnly ? "1" : "0"); }, [hasKeyOnly]);
  useEffect(() => { setPage(1); }, [qDebounced, limit, hasKeyOnly]);

  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "provider" ? "asc" : "desc" }));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("providers.title")} <span className="text-slate-500 font-mono text-lg">({data?.pagination?.total ?? data?.count ?? 40})</span></h1>
          <p className="text-sm text-slate-500 mt-0.5">Configured upstream providers, tiers and live health.</p>
        </div>
      </div>

      {!data ? <p className="text-sm text-slate-400">Loading...</p> : (
        <>
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /></div>
                <span className="text-slate-300 mx-1">|</span>
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("providers.tiers")}</h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/70">{data?.pagination?.total ?? data?.count ?? 0} providers</span>
            </div>
            <div className="p-4 bg-slate-950 font-mono text-xs overflow-x-auto leading-relaxed text-emerald-400 max-h-64">
              <pre><code>{JSON.stringify(data.tiers, null, 2)}</code></pre>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 min-w-[280px] flex-wrap items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input placeholder={t("providers.filter")} value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400 font-medium" />
              </div>
              <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${hasKeyOnly ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 accent-emerald-600" /> {t("providers.hasKey")}
              </label>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={syncLive} disabled={syncing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-75 shadow-xs active:scale-[0.98] transition-all">
                {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}{syncing ? t("providers.syncing") : t("providers.sync")}
              </button>
              <button onClick={checkHealth} disabled={loadingHealth} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-60">
                {loadingHealth ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />}{loadingHealth ? t("providers.checking") : t("providers.live_check")}
              </button>
            </div>
          </div>

          {health && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /></div>
                  <span className="text-slate-300 mx-1">|</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Live Health Summary</h2>
                  <span className="text-[11px] font-mono bg-white border border-slate-200 px-2 py-0.5 rounded-full">{health.summary ? `${health.summary.online}/${health.summary.total} online` : `${health.providers?.length ?? 0} providers`}</span>
                </div>
                <button onClick={() => setHealth(null)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">✕ Close</button>
              </div>
              <div className="p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed max-h-72">
                <pre className="text-emerald-400"><code>{JSON.stringify(health.summary || health, null, 2)}</code></pre>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort("provider")}><span className="inline-flex items-center gap-1">{t("providers.th_provider")} <ArrowUpDown className="w-3 h-3 text-slate-400" /></span></th>
                    <th className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort("tier")}>{t("providers.th_tier")} <ArrowUpDown className="w-3 h-3 inline text-slate-400" /></th>
                    <th className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort("free")}>{t("providers.th_free")} <ArrowUpDown className="w-3 h-3 inline text-slate-400" /></th>
                    <th className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort("keys")}>{t("providers.th_keys")} <ArrowUpDown className="w-3 h-3 inline text-slate-400" /></th>
                    <th className="px-4 py-3">{t("providers.th_health")}</th>
                    <th className="px-4 py-3">{t("providers.th_caps")}</th>
                    <th className="px-4 py-3">{t("providers.th_base")}</th>
                    <th className="px-4 py-3">{t("providers.th_getkey")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...(data.detailed || [])].sort((a, b) => {
                    const dir = sort.dir === "asc" ? 1 : -1;
                    if (sort.col === "provider") return a.id.localeCompare(b.id) * dir;
                    if (sort.col === "tier") return (a.tier_type || "").localeCompare(b.tier_type || "") * dir;
                    if (sort.col === "free") return (a.free_models - b.free_models) * dir;
                    if (sort.col === "keys") {
                      const ak = (a.keys === "none" ? 0 : parseInt(a.keys) || 0);
                      const bk = (b.keys === "none" ? 0 : parseInt(b.keys) || 0);
                      return (ak - bk) * dir;
                    }
                    return 0;
                  }).map((p: any) => {
                    const h = health?.providers?.find((x: any) => x.id === p.id);
                    const baseUrl = p.baseUrl || getBaseUrl(p.id);
                    const hasKey = p.hasRealKey;
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${hasKey ? "bg-emerald-50/40" : ""}`} style={hasKey ? { borderLeft: "3px solid #10b981" } : {}}>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold">{p.id}</span>
                          <div className="text-[11px] text-slate-500 mt-1">{p.name}</div>
                          {hasKey && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full border border-emerald-200">● has key</span>}
                        </td>
                        <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${p.tier_type === "permanent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{p.tier || p.tier_type}</span></td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.free_models}</td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs ${hasKey ? "bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200" : "text-slate-600"}`}>{p.keys}</span>
                          {hasKey && <span className="ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full border border-emerald-200">✓ real</span>}
                          {h && h.status !== "no-key" && <div className={`text-[11px] font-medium mt-1 ${h.status === "online" ? "text-emerald-600" : "text-rose-600"}`}>• {h.status} {h.latency_ms}ms</div>}
                        </td>
                        <td className="px-4 py-3 text-[11px] font-medium">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${h?.status === "online" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : h?.status === "offline" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{p.status}</span>
                          {h?.breaker === "open" && <span className="text-rose-600 ml-1">[breaker]</span>}
                        </td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1 max-w-[200px]">{(p.caps || []).slice(0, 3).map((c:string)=><span key={c} className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-medium text-slate-600">{c}</span>)}</div></td>
                        <td className="px-4 py-3 max-w-[220px]">
                          {baseUrl ? <div className="flex items-center gap-1.5"><code className="text-[11px] font-mono bg-slate-50 border border-slate-200 px-2 py-1 rounded-md truncate">{baseUrl}</code><button onClick={() => { navigator.clipboard.writeText(baseUrl); setCopied(p.id); setTimeout(()=>setCopied(null),1500); }} className="p-1 text-slate-400 hover:text-slate-600">{copied===p.id ? <Check className="w-3.5 h-3.5 text-emerald-600"/> : <Copy className="w-3.5 h-3.5"/>}</button></div> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <a href={getKeyUrl(p.id)} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md text-white shadow-xs ${hasKey ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`}>{hasKey ? "✓ Key" : "Get Key"} <ExternalLink className="w-3 h-3" /></a>
                          <div className="text-[10px] mt-1"><a href={`https://freellms.org/providers/${p.id}`} target="_blank" rel="noopener" className="text-slate-500 hover:text-slate-700">freellms ↗</a></div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/70 border-t border-slate-200 text-xs font-semibold text-slate-600">
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!data?.pagination?.has_prev} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md shadow-2xs disabled:opacity-40 hover:bg-slate-50">‹ {t("common.prev")}</button>
                <span className="font-mono text-slate-600">Page {data?.pagination?.page ?? 1} / {data?.pagination?.total_pages ?? 1} • {data?.pagination?.total ?? data?.count ?? 0} providers</span>
                <button onClick={() => setPage((p) => Math.min(data?.pagination?.total_pages ?? 1, p + 1))} disabled={!data?.pagination?.has_next} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md shadow-2xs disabled:opacity-40 hover:bg-slate-50">{t("common.next")} ›</button>
              </div>
              <label className="flex items-center gap-2 ml-auto">Rows: <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-semibold"><option value={25}>25</option><option value={50}>50</option></select></label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
