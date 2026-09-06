import { useEffect, useState } from "react";

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
  const [models, setModels] = useState<any[]>([]);
  const [q, setQ] = useState("");
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
  const [syncing, setSyncing] = useState(false);

  const fetchModels = () => {
    const params = new URLSearchParams();
    if (verified !== "all") params.set("verified", verified);
    if (q) params.set("q", q);
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

  useEffect(() => { fetchModels(); fetchUsage(); }, [verified, page, limit, q, hasKeyOnly]);
  useEffect(() => { setSelected(new Set()); setLive({}); }, [verified, q, page, limit, hasKeyOnly]);
  // Debounce q -> reset page
  useEffect(() => { setPage(1); }, [q, verified, limit, hasKeyOnly]);

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
  const visible = filtered;
  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "id" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");

  const isDisabled = (m: any) => {
    const h = live[m.id] || (m as any).health;
    const is404 = (h && (h.http_status === 404 || /model_not_found|Not Found|404/i.test(h.error || ""))) || !!(m as any).persisted_404;
    const isGone = h && (h.http_status === 410 || /Gone/i.test(h.error || ""));
    return is404 || isGone || m.live_status === "deprecated";
  };
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
      <h2>Models ({total})</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Filter id/provider... (vd: nvidia, gemini...)" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: 8, width: 300, border: "1px solid #ddd", borderRadius: 6 }} />
        <select value={verified} onChange={(e) => setVerified(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}>
          <option value="all">All ({total})</option>
          <option value="free">Verified free</option>
          <option value="deprecated">Deprecated</option>
          <option value="unverified">Unverified</option>
        </select>
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, background: hasKeyOnly ? "#dcfce7" : "white", border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}><input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} /> Chỉ hiện provider đã nhập key</label>
        <label style={{ fontSize: 12 }}>LOV <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} style={{ padding: 6, border: "1px solid #ddd", borderRadius: 6 }}><option value={25}>25</option><option value={50}>50</option></select></label>
        <button onClick={fetchModels}>Refresh</button>
        <button onClick={syncLive} disabled={syncing} style={{ background: "#16a34a", color: "white", border: "1px solid #16a34a", opacity: syncing ? 0.6 : 1 }}>{syncing ? "Syncing..." : "↻ Sync Live Now"}</button>
        <button onClick={checkSelected} disabled={checking || selected.size === 0} style={{ background: selected.size > 0 ? "#2563eb" : "#f1f5f9", color: selected.size > 0 ? "white" : "#64748b", border: selected.size > 0 ? "1px solid #2563eb" : "1px solid #ddd", opacity: checking ? 0.6 : 1 }}>
          {checking ? "Checking..." : `Check Live (${selected.size})`}
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>{selected.size} selected • tick checkbox để chọn</span>
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Verified: probe 24h (xanh verified, đỏ deprecated, vàng no-key). <b>Live</b>: tick checkbox rồi bấm <code>Check Live</code> để gọi thử <code>POST /v1/chat/completions</code> (8s timeout) — biết model nào thực sự <b>usable</b>.</div>
      <table>
        <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} title={visibleEnabled.length === 0 ? "Không còn model khả dụng để chọn" : "Chọn tất cả khả dụng"} disabled={visibleEnabled.length === 0} /></th><th onClick={() => toggleSort("id")} style={{ cursor: "pointer", userSelect: "none" }}>ID {arrow("id")}</th><th onClick={() => toggleSort("provider")} style={{ cursor: "pointer", userSelect: "none" }}>Provider {arrow("provider")}</th><th onClick={() => toggleSort("context")} style={{ cursor: "pointer", userSelect: "none" }}>Context {arrow("context")}</th><th onClick={() => toggleSort("score")} style={{ cursor: "pointer", userSelect: "none" }}>Score {arrow("score")}</th><th onClick={() => toggleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}>Status {arrow("status")}</th><th>Live</th><th onClick={() => toggleSort("used")} style={{ cursor: "pointer", userSelect: "none" }}>Used / Limit {arrow("used")}</th></tr></thead>
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
      <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", zIndex: 10, boxShadow: "0 -2px 8px rgba(0,0,0,0.04)" }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹ Prev</button>
        <span style={{ fontSize: 12 }}>Page {page} / {totalPages} • {total} models</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next ›</button>
        <span style={{ fontSize: 11, color: "#888" }}>LOV {limit}/page</span>
      </div>
      {filtered.length === 0 && <p style={{ fontSize: 12, color: "#888" }}>Không có model nào khớp filter.</p>}
    </div>
  );
}
