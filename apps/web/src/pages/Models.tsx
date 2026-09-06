import { useEffect, useState } from "react";
import { useLang } from "../lib/i18n.tsx";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

function badge(status?: string) {
  if (status === "verified_free") return <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>verified</span>;
  if (status === "deprecated") return <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>deprecated</span>;
  if (status === "unverified_no_key") return <span style={{ background: "#fef9c3", color: "#854d0e", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>no-key</span>;
  if (status === "public" || status === "alias") return <span style={{ background: "#e0e7ff", color: "#3730a3", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>{status}</span>;
  return <span style={{ background: "#f1f5f9", color: "#64748b", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>{status || "unverified"}</span>;
}

function parseLimit(limit?: string): string {
  if (!limit) return "-";
  // Shorten: "Up to 40 RPM" -> "40 RPM", "15 RPM, 1,500 RPD" -> "15 RPM"
  return limit;
}

export default function Models() {
  const { t } = useLang();
  const [models, setModels] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
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
  const [hasKeyOnly, setHasKeyOnly] = useState(false);
  const [hide404, setHide404] = useState(() => {
    const v = localStorage.getItem("hide404");
    const migrated = localStorage.getItem("hide404_migrated");
    if (!migrated) {
      localStorage.setItem("hide404_migrated", "1");
      localStorage.setItem("hide404", "1");
      return true;
    }
    return v !== "0";
  });
  const [syncing, setSyncing] = useState(false);

  // Debounce q 400ms to avoid 429 on typing
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const fetchModels = () => {
    const params = new URLSearchParams();
    if (verified !== "all") params.set("verified", verified);
    if (qDebounced) params.set("q", qDebounced);
    if (hasKeyOnly) params.set("hasKey", "1");
    params.set("page", String(page));
    params.set("limit", String(limit));
    fetch(`/v1/models?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => r.json())
      .then((d) => {
        setModels(d.data || []);
        setTotal(d.total ?? d.data?.length ?? 0);
        setTotalPages(d.pagination?.total_pages ?? Math.ceil((d.total ?? 0) / limit) ?? 1);
      })
      .catch(() => setModels([]));
  };

  const fetchUsage = () => {
    fetch(`/api/logs?limit=200`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => r.json()).then((d) => {
        const map: Record<string, number> = {};
        for (const l of d.data || []) {
          const id = l.model || "";
          map[id] = (map[id] || 0) + 1;
        }
        setUsage(map);
      }).catch(() => {});
  };

  useEffect(() => { fetchModels(); fetchUsage(); }, [verified, page, limit, qDebounced, hasKeyOnly]);
  useEffect(() => { setSelected(new Set()); setLive({}); }, [verified, qDebounced, page, limit, hasKeyOnly]);
  // Debounce q -> reset page
  useEffect(() => { setPage(1); }, [qDebounced, verified, limit, hasKeyOnly]);
  useEffect(() => { localStorage.setItem("hide404", hide404 ? "1" : "0"); }, [hide404]);

  const syncLive = async () => {
    if (!confirm("Sync Live sẽ gọi provider.models() bằng key thật trong .env để cập nhật danh sách model mới nhất (có thể mất 10-20s). Tiếp tục?")) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/models/live/sync`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" } });
      const data = await res.json().catch(() => null);
      // also refresh verify for deprecated tracking
      await fetch(`/api/verify`, { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }) }).catch(() => {});
      alert(data ? `Sync xong: ${data.total} live models từ ${data.providers} providers` : "Sync done");
      fetchModels();
    } catch (e: any) { alert("Sync failed: " + e.message); }
    finally { setSyncing(false); }
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
    const h = live[m.id] || (m as any).health;
    const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || !!(m as any).persisted_404;
    const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || ""));
    return is404 || isGone || m.live_status === "deprecated";
  };
  const visibleBase = filtered;
  const visible = hide404 ? visibleBase.filter((m) => !isDisabled(m)) : visibleBase;
  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "id" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");

  const visibleEnabled = visible.filter((m) => !isDisabled(m));
  const allVisibleSelected = visibleEnabled.length > 0 && visibleEnabled.every((m) => selected.has(m.id));
  const toggle = (id: string) => {
    const m = visible.find((x) => x.id === id);
    if (m && isDisabled(m)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(visibleEnabled.map((m) => m.id)));
  };

  const checkSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) { alert("Chọn ít nhất 1 model (tick checkbox)"); return; }
    if (ids.length > 20) { if (!confirm(`Check ${ids.length} models sẽ mất ~${ids.length * 2}s và có thể hit rate limit. Tiếp tục?`)) return; }
    setChecking(true);
    try {
      const toPersist: string[] = [];
      const persistPayload: any[] = [];
      for (const id of ids) {
        const res = await fetch(`/api/models/health?model=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${mk()}` } });
        const data = await res.json().catch(() => null);
        if (data) {
          setLive((prev) => ({ ...prev, [id]: data }));
          if (data.http_status === 404 || data.http_status === 410 || /model_not_found|Gone/i.test(data.error || "")) {
            toPersist.push(id);
            persistPayload.push({ id, http_status: data.http_status, error: data.error });
          }
        }
      }
      if (toPersist.length > 0) {
        // Persist 404/410 to DB/file so reload keeps strikethrough + router skips it
        await fetch(`/api/models/health/mark`, {
          method: "POST",
          headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ids: toPersist, http_status: 404, error: "model_not_found", details: persistPayload }),
        }).catch(() => {});
        // Also cache in localStorage for immediate offline
        try {
          const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}");
          for (const id of toPersist) cur[id] = { http_status: 404, updated_at: new Date().toISOString() };
          localStorage.setItem("modelHealth404", JSON.stringify(cur));
        } catch {}
      }
    } finally { setChecking(false); }
  };

  // Load persisted 404/410 on mount so rows already strikethrough without re-check
  useEffect(() => {
    fetch(`/api/models/health/persisted`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => r.json()).then((d) => {
        const map: Record<string, any> = {};
        for (const row of d.data || []) map[row.id] = row;
        if (Object.keys(map).length > 0) setLive((prev) => ({ ...map, ...prev }));
      }).catch(() => {});
    try {
      const cur = JSON.parse(localStorage.getItem("modelHealth404") || "{}");
      if (Object.keys(cur).length > 0) setLive((prev) => ({ ...cur, ...prev }));
    } catch {}
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t("models.title")} <span style={{ fontSize: 13, fontWeight: 400, color: "#64748b", background: "white", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 20 }}>{total}</span></h2>
        <span style={{ fontSize: 12, color: "#64748b" }}>{t("common.page")} {page}/{totalPages}</span>
      </div>
      <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 380 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>🔍</span>
            <input placeholder={t("models.filter_placeholder")} value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "8px 12px 8px 32px", width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }} />
          </div>
          <select value={verified} onChange={(e) => setVerified(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 10, background: "white", fontSize: 13 }}>
            <option value="all">{t("models.verified_all")} ({total})</option>
            <option value="free">{t("models.verified_free")}</option>
            <option value="deprecated">{t("models.verified_deprecated")}</option>
            <option value="unverified">{t("models.verified_unverified")}</option>
          </select>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
            <label title={t("models.hasKey")} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 500, background: hasKeyOnly ? "#dcfce7" : "white", border: `1px solid ${hasKeyOnly ? "#86efac" : "#e2e8f0"}`, padding: "7px 12px", borderRadius: 20, cursor: "pointer", color: hasKeyOnly ? "#166534" : "#475569" }}><input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} style={{ accentColor: "#16a34a" }} /> {t("models.hasKey")}</label>
            <label title={t("models.hide404")} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 500, background: hide404 ? "#fee2e2" : "white", border: `1px solid ${hide404 ? "#fca5a5" : "#e2e8f0"}`, padding: "7px 12px", borderRadius: 20, cursor: "pointer", color: hide404 ? "#991b1b" : "#475569" }}><input type="checkbox" checked={hide404} onChange={(e) => setHide404(e.target.checked)} style={{ accentColor: "#dc2626" }} /> {t("models.hide404")}</label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap", paddingTop: 4 }}>
          <button onClick={checkSelected} disabled={checking || selected.size === 0} style={{ background: selected.size > 0 ? "#2563eb" : "white", color: selected.size > 0 ? "white" : "#94a3b8", border: `1px solid ${selected.size > 0 ? "#2563eb" : "#e2e8f0"}`, display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
            {checking ? `⏳ ${t("models.checking")}` : `✓ ${t("models.check_live")} (${selected.size})`}
          </button>
          <button onClick={syncLive} disabled={syncing} style={{ background: syncing ? "#f1f5f9" : "#16a34a", color: syncing ? "#64748b" : "white", border: `1px solid ${syncing ? "#e2e8f0" : "#16a34a"}`, display: "flex", gap: 6, alignItems: "center" }}>{syncing ? `⏳ ${t("models.syncing")}` : t("models.sync")}</button>
          <button onClick={fetchModels} title={t("models.refresh")} style={{ display: "flex", gap: 6, alignItems: "center" }}>↻ {t("models.refresh")}</button>
        </div>
        {(qDebounced || verified !== "all" || hasKeyOnly || hide404) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
            <span>Filters:</span>
            {qDebounced && <span style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 20 }}>q: {qDebounced} <button onClick={() => setQ("")} style={{ marginLeft: 4, padding: "0 4px", fontSize: 10, border: "none", background: "transparent", cursor: "pointer" }}>✕</button></span>}
            {verified !== "all" && <span style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 20 }}>{verified} <button onClick={() => setVerified("all")} style={{ marginLeft: 4, padding: "0 4px", fontSize: 10, border: "none", background: "transparent", cursor: "pointer" }}>✕</button></span>}
            {hasKeyOnly && <span style={{ background: "#dcfce7", border: "1px solid #86efac", padding: "2px 8px", borderRadius: 20, color: "#166534" }}>{t("models.hasKey")}</span>}
            {hide404 && <span style={{ background: "#fee2e2", border: "1px solid #fca5a5", padding: "2px 8px", borderRadius: 20, color: "#991b1b" }}>{t("models.hide404")}</span>}
            <span style={{ marginLeft: "auto", color: "#94a3b8" }}>{selected.size} {t("models.selected")} • {visible.length} visible</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span> {t("models.verified_desc")}</div>
      <table>
        <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} title={visibleEnabled.length === 0 ? t("models.no_match") : ""} disabled={visibleEnabled.length === 0} /></th><th onClick={() => toggleSort("id")} style={{ cursor: "pointer", userSelect: "none" }}>{t("models.th_id")} {arrow("id")}</th><th onClick={() => toggleSort("provider")} style={{ cursor: "pointer", userSelect: "none" }}>{t("models.th_provider")} {arrow("provider")}</th><th onClick={() => toggleSort("context")} style={{ cursor: "pointer", userSelect: "none" }}>{t("models.th_context")} {arrow("context")}</th><th onClick={() => toggleSort("score")} style={{ cursor: "pointer", userSelect: "none" }}>{t("models.th_score")} {arrow("score")}</th><th onClick={() => toggleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}>{t("models.th_status")} {arrow("status")}</th><th>{t("models.th_live")}</th><th onClick={() => toggleSort("used")} style={{ cursor: "pointer", userSelect: "none" }}>{t("models.th_used")} {arrow("used")}</th></tr></thead>
        <tbody>
          {visible.map((m) => {
            const h = live[m.id] || (m as any).health || (m.persisted_404 ? { http_status: 404, error: "model_not_found" } : null);
            const used = usage[m.id] || 0;
            const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || (m as any).persisted_404;
            const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || ""));
            const disabled = is404 || isGone || m.live_status === "deprecated";
            const rowStyle: any = disabled
              ? { background: "#fff1f2", opacity: 0.6, textDecoration: "line-through", textDecorationColor: "#dc2626" }
              : { background: selected.has(m.id) ? "#f0f9ff" : "transparent" };
            return (
              <tr key={m.id} style={rowStyle} title={disabled ? "404/410 disabled - đã lưu, không cho live check lại" : ""}>
                <td style={{ textDecoration: "none" }}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} disabled={disabled} title={disabled ? "Model 404/410 đã disabled" : ""} /></td>
                <td><code style={{ fontSize: 12, textDecoration: is404 || isGone ? "line-through" : "none" }}>{m.id}</code></td>
                <td style={{ fontSize: 12 }}>{m.owned_by || m.provider}</td>
                <td>{m.context_length ? (m.context_length >= 1000000 ? (m.context_length/1000000)+"M" : m.context_length >= 1000 ? Math.round(m.context_length/1000)+"K" : m.context_length) : "-"}</td>
                <td>{m.score ?? "-"}</td>
                <td style={{ textDecoration: "none" }}>{badge(m.live_status)}</td>
                <td style={{ fontSize: 11, textDecoration: "none" }}>{h ? (h.status === "usable" ? <span style={{ color: "#16a34a" }}>✅ usable {h.latency_ms}ms</span> : h.status === "no-key" ? <span style={{ color: "#854d0e" }}>no-key</span> : <span style={{ color: "#dc2626", fontWeight: is404 || isGone ? 600 : 400 }}>{h.status}{h.http_status ? ` ${h.http_status}` : ""}</span>) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                <td style={{ fontSize: 11, textDecoration: "none" }}><span style={{ fontWeight: used > 0 ? 600 : 400 }}>{used}</span> / {parseLimit(m.limit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 12px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", zIndex: 10, boxShadow: "0 -2px 8px rgba(0,0,0,0.04)" }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>{t("common.prev")}</button>
        <span style={{ fontSize: 12 }}>{t("common.page")} {page} / {totalPages} • {total} models</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{t("common.next")}</button>
        <label style={{ fontSize: 12, marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>{t("models.lov")} <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white" }}><option value={25}>25</option><option value={50}>50</option></select></label>
      </div>
      {filtered.length === 0 && <p style={{ fontSize: 12, color: "#888" }}>{t("models.no_match")}</p>}
    </div>
  );
}
