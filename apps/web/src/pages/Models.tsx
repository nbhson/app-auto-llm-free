import { useEffect, useState } from "react";
import { Search, RefreshCw, X, Check, ChevronDown, Filter } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

function badge(status?: string) {
  if (status === "verified_free") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">verified</span>;
  if (status === "deprecated") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">deprecated</span>;
  if (status === "unverified_no_key") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">no-key</span>;
  if (status === "public" || status === "alias") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">{status}</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{status || "unverified"}</span>;
}

function parseLimit(limit?: string): string { return limit || "-"; }

export default function Models() {
  const { t } = useLang();
  const [models, setModels] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [provider, setProvider] = useState("");
  const [providerDebounced, setProviderDebounced] = useState("");
  const [verified, setVerified] = useState<string>("all");
  const [live, setLive] = useState<Record<string, any>>({});
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "score", dir: "desc" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasKeyOnly, setHasKeyOnly] = useState(() => {
    const v = localStorage.getItem("hasKeyOnly");
    if (v === null) { localStorage.setItem("hasKeyOnly", "1"); return true; }
    return v !== "0";
  });
  const [hide404, setHide404] = useState(() => {
    const v = localStorage.getItem("hide404");
    const migrated = localStorage.getItem("hide404_migrated");
    if (!migrated) { localStorage.setItem("hide404_migrated", "1"); localStorage.setItem("hide404", "1"); return true; }
    return v !== "0";
  });
  const [hidePayment, setHidePayment] = useState(() => {
    const v = localStorage.getItem("hidePayment");
    if (v === null) { localStorage.setItem("hidePayment", "1"); return true; }
    return v !== "0";
  });
  const [hideInvalid, setHideInvalid] = useState(() => {
    const v = localStorage.getItem("hideInvalid");
    if (v === null) { localStorage.setItem("hideInvalid", "1"); return true; }
    return v !== "0";
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { const id = setTimeout(() => setQDebounced(q), 400); return () => clearTimeout(id); }, [q]);
  useEffect(() => { const id = setTimeout(() => setProviderDebounced(provider.trim()), 400); return () => clearTimeout(id); }, [provider]);

  const fetchModels = () => {
    const params = new URLSearchParams();
    if (verified !== "all") params.set("verified", verified);
    if (qDebounced) params.set("q", qDebounced);
    if (providerDebounced) params.set("provider", providerDebounced);
    if (hasKeyOnly) params.set("hasKey", "1");
    // When hide filters are on, fetch larger set and do client-side pagination after filtering to ensure each page has full limit visible
    const needClientSide = hide404 || hidePayment || hideInvalid;
    const fetchLimit = needClientSide ? 1000 : limit;
    const fetchPage = needClientSide ? 1 : page;
    params.set("page", String(fetchPage)); params.set("limit", String(fetchLimit));
    fetch(`/v1/models?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => {
      if (needClientSide) {
        // For hide filters, backend returns up to 100, we will handle pagination client-side after filtering in visible logic.
        // Store all fetched for client-side pagination; total will be recalculated after filtering.
        setModels(d.data || []);
        // Use backend total as estimate, but visible pagination will be based on filtered length
        setTotal(d.total ?? d.data?.length ?? 0);
        setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / limit)));
      } else {
        setModels(d.data || []); setTotal(d.total ?? d.data?.length ?? 0); setTotalPages(d.pagination?.total_pages ?? Math.ceil((d.total ?? 0) / limit) ?? 1);
      }
    }).catch(() => setModels([]));
  };
  const fetchUsage = () => {
    fetch(`/api/logs?limit=200`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => {
      const map: Record<string, number> = {}; for (const l of d.data || []) { const id = l.model || ""; map[id] = (map[id] || 0) + 1; } setUsage(map);
    }).catch(() => {});
  };
  useEffect(() => { fetchModels(); fetchUsage(); }, [verified, page, limit, qDebounced, providerDebounced, hasKeyOnly, hide404, hidePayment, hideInvalid]);
  useEffect(() => { setSelected(new Set()); }, [verified, qDebounced, providerDebounced, hasKeyOnly, hide404, hidePayment, hideInvalid]);
  useEffect(() => { setPage(1); }, [qDebounced, providerDebounced, verified, limit, hasKeyOnly, hide404, hidePayment, hideInvalid]);
  useEffect(() => { localStorage.setItem("hide404", hide404 ? "1" : "0"); }, [hide404]);
  useEffect(() => { localStorage.setItem("hidePayment", hidePayment ? "1" : "0"); }, [hidePayment]);
  useEffect(() => { localStorage.setItem("hideInvalid", hideInvalid ? "1" : "0"); }, [hideInvalid]);
  useEffect(() => { localStorage.setItem("hasKeyOnly", hasKeyOnly ? "1" : "0"); }, [hasKeyOnly]);

  const syncLive = async () => {
    if (!confirm("Sync Live sẽ gọi provider.models() bằng key thật trong .env để cập nhật danh sách model mới nhất (có thể mất 10-20s). Tiếp tục?")) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/models/live/sync`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" } });
      const data = await res.json().catch(() => null);
      await fetch(`/api/verify`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }) }).catch(() => {});
      alert(data ? `Sync xong: ${data.total} live models từ ${data.providers} providers` : "Sync done"); fetchModels();
    } catch (e: any) { alert("Sync failed: " + e.message); } finally { setSyncing(false); }
  };

  const filtered = [...models].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.col === "id") return a.id.localeCompare(b.id) * dir;
    if (sort.col === "provider") return (a.owned_by || a.provider || "").localeCompare(b.owned_by || b.provider || "") * dir;
    if (sort.col === "context") return ((a.context_length || 0) - (b.context_length || 0)) * dir;
    if (sort.col === "score") return ((a.score || 0) - (b.score || 0)) * dir;
    if (sort.col === "used") return ((usage[a.id] || 0) - (usage[b.id] || 0)) * dir;
    if (sort.col === "status") return (a.live_status || "").localeCompare(b.live_status || "") * dir;
    return 0;
  });
  const isDisabled = (m: any) => {
    const h = live[m.id] || (m as any).health; const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || !!(m as any).persisted_404; const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || "")); return is404 || isGone || m.live_status === "deprecated";
  };
  // For hide filtering, use only persisted health (m.health / persisted_404 / live_status), NOT transient live[m.id] from just-checked Check Live.
  // This keeps just-checked 404/payment rows visible with strikethrough so user can see the Live result instead of instantly disappearing.
  const isDisabledForHide = (m: any) => {
    const h = (m as any).health; const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || !!(m as any).persisted_404; const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || "")); return is404 || isGone || m.live_status === "deprecated";
  };
  const isPaymentError = (m: any) => {
    const h = live[m.id] || (m as any).health;
    if (!h) return false;
    const status = h.http_status;
    const err = (h.error || h.message || "").toLowerCase();
    if (status === 402 || status === 429) {
      if (/out of credits|no payment|payment method|insufficient|quota|billing|payment_required|unpaid|exceeded|balance|credit/i.test(err)) return true;
      if (status === 402) return true;
    }
    if (/you\'re out of credits|out of credits|no payment method|payment required|insufficient.*credit|quota exceeded|billing|unpaid/i.test(err)) return true;
    return false;
  };
  const isPaymentForHide = (m: any) => {
    const h = (m as any).health;
    if (!h) return false;
    const status = h.http_status;
    const err = (h.error || h.message || "").toLowerCase();
    if (status === 402 || status === 429) {
      if (/out of credits|no payment|payment method|insufficient|quota|billing|payment_required|unpaid|exceeded|balance|credit/i.test(err)) return true;
      if (status === 402) return true;
    }
    if (/you\'re out of credits|out of credits|no payment method|payment required|insufficient.*credit|quota exceeded|billing|unpaid/i.test(err)) return true;
    return false;
  };
  const ALIAS_IDS = new Set(["auto","gpt-4","gpt-3.5","claude-3","gemini","gemini-flash","llama","qwen","glm","kimi","code","embedding","rerank","deepseek","mistral","kilo-auto"]);
  const isInvalidId = (m: any) => {
    const id: string = (m.id || "").trim();
    if (!id) return true;
    if (ALIAS_IDS.has(id)) return false;
    if (m.owned_by === "gateway" && id === "auto") return false;
    // valid: provider/model with slash, no spaces, allowed chars a-z0-9-_.:/ 
    if (!id.includes("/")) return true;
    if (/\s/.test(id)) return true;
    if (/[^a-zA-Z0-9-_/.:]/.test(id)) return true;
    if (id.startsWith("/") || id.endsWith("/") || id.includes("//")) return true;
    return false;
  };
  const hideActive = hide404 || hidePayment || hideInvalid;
  let filteredAfterHide = filtered;
  if (hide404) filteredAfterHide = filteredAfterHide.filter((m) => !isDisabledForHide(m));
  if (hidePayment) filteredAfterHide = filteredAfterHide.filter((m) => !isPaymentForHide(m));
  if (hideInvalid) filteredAfterHide = filteredAfterHide.filter((m) => !isInvalidId(m));
  // When hide filters are active, we fetched 100 and do client-side pagination to ensure each page has full limit visible
  const totalDisplay = hideActive ? filteredAfterHide.length : total;
  const totalPagesDisplay = hideActive ? Math.max(1, Math.ceil(filteredAfterHide.length / limit)) : totalPages;
  const visible = hideActive ? filteredAfterHide.slice((page - 1) * limit, page * limit) : filteredAfterHide;
  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "id" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");
  const visibleEnabled = visible; // allow 404/payment to be re-checked (only truly deprecated without 404 was previously blocked)
  const allVisibleSelected = visibleEnabled.length > 0 && visibleEnabled.every((m) => selected.has(m.id));
  const toggle = (id: string) => { setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleAll = () => { if (allVisibleSelected) setSelected(new Set()); else setSelected(new Set(visibleEnabled.map((m) => m.id))); };
  const checkSelected = async () => {
    const ids = Array.from(selected); if (ids.length === 0) { alert("Chọn ít nhất 1 model (tick checkbox)"); return; }
    if (ids.length > 20) { if (!confirm(`Check ${ids.length} models sẽ mất ~${ids.length * 2}s và có thể hit rate limit. Tiếp tục?`)) return; }
    setChecking(true);
    try {
      const toPersist: string[] = []; const persistPayload: any[] = [];
      for (const id of ids) {
        const res = await fetch(`/api/models/health?model=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${mk()}` } });
        const data = await res.json().catch(() => null);
        if (data) { setLive((prev) => ({ ...prev, [id]: data })); if (data.http_status === 404 || data.http_status === 410 || /model_not_found|Gone/i.test(data.error || "")) { toPersist.push(id); persistPayload.push({ id, http_status: data.http_status, error: data.error }); } }
      }
      if (toPersist.length > 0) {
        await fetch(`/api/models/health/mark`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: toPersist, http_status: 404, error: "model_not_found", details: persistPayload }) }).catch(() => {});
        try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); for (const id of toPersist) cur[id] = { http_status: 404, updated_at: new Date().toISOString() }; localStorage.setItem("modelHealth404", JSON.stringify(cur)); } catch {}
      }
    } finally { setChecking(false); }
  };
  useEffect(() => {
    fetch(`/api/models/health/persisted`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => { const map: Record<string, any> = {}; for (const row of d.data || []) map[row.id] = row; if (Object.keys(map).length > 0) setLive((prev) => ({ ...map, ...prev })); }).catch(() => {});
    try { const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}"); if (Object.keys(cur).length > 0) setLive((prev) => ({ ...cur, ...prev })); } catch {}
  }, []);

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("models.title")} <span className="text-sm font-mono font-semibold bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">{total}</span></h1>
        <span className="text-xs text-slate-500 font-mono">Page {page}/{totalPages}</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input placeholder="Filter by ID..." value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400" />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full"><X className="w-3 h-3 text-slate-400" /></button>}
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-[220px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input list="provider-list" placeholder="Filter by provider..." value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400" />
            {provider && <button onClick={() => setProvider("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full"><X className="w-3 h-3 text-slate-400" /></button>}
            <datalist id="provider-list">
              <option value="nvidia-nim" />
              <option value="openrouter" />
              <option value="kilo-code" />
              <option value="opencode" />
              <option value="google-gemini" />
              <option value="groq" />
              <option value="cerebras" />
              <option value="modelscope" />
              <option value="cloudflare-workers-ai" />
              <option value="cohere" />
              <option value="mistral-ai" />
              <option value="hugging-face" />
              <option value="agnes-ai" />
              <option value="sambanova" />
              <option value="chutes-ai" />
              <option value="llm7-io" />
              <option value="ovhcloud-ai-endpoints" />
              <option value="ollama-cloud" />
              <option value="z-ai-zhipu-ai" />
              <option value="aion-labs" />
              <option value="pollinations" />
            </datalist>
          </div>
          <select value={verified} onChange={(e) => setVerified(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold">
            <option value="all">{t("models.verified_all")} ({total})</option>
            <option value="free">{t("models.verified_free")}</option>
            <option value="deprecated">{t("models.verified_deprecated")}</option>
            <option value="unverified">{t("models.verified_unverified")}</option>
          </select>
          <div className="relative">
            <button type="button" onClick={() => setFilterOpen(!filterOpen)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-500" /> Filters {(hasKeyOnly?1:0)+(hide404?1:0)+(hidePayment?1:0)+(hideInvalid?1:0) > 0 && <span className="bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">{(hasKeyOnly?1:0)+(hide404?1:0)+(hidePayment?1:0)+(hideInvalid?1:0)}</span>} <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>
            {filterOpen && (
              <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-20">
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-emerald-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hasKey")}</span>
                  {hasKeyOnly && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hide404} onChange={(e) => setHide404(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-rose-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hide404")}</span>
                  {hide404 && <Check className="w-3.5 h-3.5 text-rose-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hidePayment} onChange={(e) => setHidePayment(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-amber-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hide_payment")}</span>
                  {hidePayment && <Check className="w-3.5 h-3.5 text-amber-600" />}
                </label>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={hideInvalid} onChange={(e) => setHideInvalid(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-slate-600" />
                  <span className="text-xs font-semibold text-slate-700 flex-1">{t("models.hide_invalid")}</span>
                  {hideInvalid && <Check className="w-3.5 h-3.5 text-slate-600" />}
                </label>
                <div className="border-t border-slate-100 mt-2 pt-2 px-3 flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">{(hasKeyOnly?1:0)+(hide404?1:0)+(hidePayment?1:0)+(hideInvalid?1:0)} active</span>
                  <button onClick={() => { setHasKeyOnly(true); setHide404(true); setHidePayment(true); setHideInvalid(true); }} className="text-[11px] font-semibold text-slate-600 hover:text-slate-900">Reset default</button>
                </div>
              </div>
            )}
          </div>
          <div className="ml-auto flex flex-wrap gap-2 items-center">
            <button onClick={checkSelected} disabled={checking || selected.size === 0} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs ${selected.size > 0 ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white text-slate-400 border border-slate-200"}`}>{checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}{checking ? t("models.checking") : `${t("models.check_live")} (${selected.size})`}</button>
            <button onClick={syncLive} disabled={syncing} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${syncing ? "bg-slate-100 text-slate-500 border border-slate-200" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{syncing ? t("models.syncing") : t("models.sync")}</button>
            <button onClick={fetchModels} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5" /> {t("models.refresh")}</button>
          </div>
        </div>
        {(qDebounced || providerDebounced || verified !== "all" || hasKeyOnly || hide404 || hidePayment || hideInvalid) && (
          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-600 border-t border-slate-100 pt-3">
            <span className="font-semibold">Filters:</span>
            {qDebounced && <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">id: {qDebounced}<button onClick={() => setQ("")} className="p-0.5 hover:bg-slate-200 rounded-full"><X className="w-3 h-3" /></button></span>}
            {providerDebounced && <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full font-semibold">provider: {providerDebounced}<button onClick={() => setProvider("")} className="p-0.5 hover:bg-blue-100 rounded-full"><X className="w-3 h-3" /></button></span>}
            {verified !== "all" && <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">{verified}<button onClick={() => setVerified("all")} className="p-0.5 hover:bg-slate-200 rounded-full"><X className="w-3 h-3" /></button></span>}
            {hasKeyOnly && <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hasKey")}</span>}
            {hide404 && <span className="bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hide404")}</span>}
            {hidePayment && <span className="bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hide_payment")}</span>}
            {hideInvalid && <span className="bg-slate-100 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full font-semibold">{t("models.hide_invalid")}</span>}
            <span className="ml-auto text-slate-400 font-mono">{selected.size} selected • {visible.length} visible</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />{t("models.verified_desc")}</div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-3 py-3 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={visibleEnabled.length === 0} className="w-4 h-4 accent-slate-900" /></th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("id")}>{t("models.th_id")} {arrow("id")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("provider")}>{t("models.th_provider")} {arrow("provider")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("context")}>{t("models.th_context")} {arrow("context")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("score")}>{t("models.th_score")} {arrow("score")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("status")}>{t("models.th_status")} {arrow("status")}</th>
                <th className="px-3 py-3">{t("models.th_live")}</th>
                <th className="px-3 py-3 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("used")}>{t("models.th_used")} {arrow("used")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((m) => {
                const h = live[m.id] || (m as any).health || (m.persisted_404 ? { http_status: 404, error: "model_not_found" } : null);
                const used = usage[m.id] || 0; const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || (m as any).persisted_404; const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || "")); const isPayment = (()=>{ const err=(h?.error||"").toLowerCase(); const st=h?.http_status; return st===402 || /you\'re out of credits|out of credits|no payment method|payment required|insufficient|quota exceeded|billing|unpaid/i.test(err); })(); const isInvalid = isInvalidId(m); const disabled = is404 || isGone || isPayment || isInvalid || m.live_status === "deprecated";
                return (
                  <tr key={m.id} className={`${disabled ? `${isPayment ? "bg-amber-50/60 opacity-60 line-through decoration-amber-400" : isInvalid ? "bg-slate-100/60 opacity-60 line-through decoration-slate-400" : "bg-rose-50/60 opacity-60 line-through decoration-rose-400"}` : selected.has(m.id) ? "bg-blue-50/40" : "hover:bg-slate-50/80"} transition-colors`} title={isInvalid ? "Invalid model ID" : isPayment ? "Out of credits / payment required — click to re-check" : is404 || isGone ? "404/410 — click to re-check" : ""}>
                    <td className="px-3 py-3 text-center"><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="w-4 h-4 accent-slate-900" /></td>
                    <td className="px-3 py-3"><code className={`text-xs font-mono px-2 py-0.5 rounded border font-semibold ${disabled ? (isInvalid ? "bg-slate-200 text-slate-600 border-slate-300 line-through" : isPayment ? "bg-amber-100 text-amber-700 border-amber-200 line-through" : "bg-rose-100 text-rose-700 border-rose-200 line-through") : "bg-slate-100 text-slate-800 border-slate-200"}`}>{m.id}</code></td>
                    <td className="px-3 py-3 font-medium text-slate-700">{m.owned_by || m.provider}</td>
                    <td className="px-3 py-3 font-mono text-slate-600">{m.context_length ? (m.context_length >= 1000000 ? (m.context_length/1000000)+"M" : m.context_length >= 1000 ? Math.round(m.context_length/1000)+"K" : m.context_length) : "-"}</td>
                    <td className="px-3 py-3 font-mono font-bold">{m.score ?? "-"}</td>
                    <td className="px-3 py-3">{badge(m.live_status)}</td>
                    <td className="px-3 py-3 text-xs">{h ? (isPayment ? <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold text-[11px]">out of credits {h.http_status ? ` ${h.http_status}` : ""}</span> : h.status === "usable" ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold text-[11px]"><Check className="w-3 h-3" /> usable {h.latency_ms}ms</span> : h.status === "no-key" ? <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">no-key</span> : <span className="text-rose-700 font-semibold">{h.status}{h.http_status ? ` ${h.http_status}` : ""}</span>) : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 font-mono text-slate-600"><span className={used>0 ? "font-bold text-slate-800" : ""}>{used}</span> / {parseLimit(m.limit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-slate-400">{t("models.no_match")}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/70 border-t border-slate-200 text-xs font-semibold text-slate-600 sticky bottom-0 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md shadow-2xs disabled:opacity-40 hover:bg-slate-50">‹ {t("common.prev")}</button>
            <span className="font-mono text-slate-600">Page {page} / {totalPagesDisplay} • {hideActive ? `${filteredAfterHide.length} total • ${visible.length} visible` : `${total} models`} {`• ${limit}/page`}</span>
            <button onClick={() => setPage((p) => Math.min(totalPagesDisplay, p + 1))} disabled={page >= totalPagesDisplay} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md shadow-2xs disabled:opacity-40 hover:bg-slate-50">{t("common.next")} ›</button>
          </div>
          <label className="flex items-center gap-2 ml-auto">Rows: <select value={limit} onChange={(e) => { const v=parseInt(e.target.value); setLimit(v); setPage(1); }} className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-semibold"><option value={25}>25</option><option value={50}>50</option></select></label>
        </div>
      </div>
    </div>
  );
}
