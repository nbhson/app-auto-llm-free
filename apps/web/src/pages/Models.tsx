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

  const fetchModels = () => {
    const params = new URLSearchParams();
    if (verified !== "all") params.set("verified", verified);
    fetch(`/v1/models?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => r.json())
      .then((d) => setModels(d.data || []))
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

  useEffect(() => { fetchModels(); fetchUsage(); }, [verified]);
  useEffect(() => { setSelected(new Set()); setLive({}); }, [verified, q]);

  const filteredRaw = models.filter((m) => !q || m.id.toLowerCase().includes(q.toLowerCase()) || (m.provider || "").toLowerCase().includes(q.toLowerCase()) || (m.owned_by || "").toLowerCase().includes(q.toLowerCase()));
  const filtered = [...filteredRaw].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.col === "id") return a.id.localeCompare(b.id) * dir;
    if (sort.col === "provider") return (a.owned_by || a.provider || "").localeCompare(b.owned_by || b.provider || "") * dir;
    if (sort.col === "context") return ((a.context_length || 0) - (b.context_length || 0)) * dir;
    if (sort.col === "score") return ((a.score || 0) - (b.score || 0)) * dir;
    if (sort.col === "used") return ((usage[a.id] || 0) - (usage[b.id] || 0)) * dir;
    if (sort.col === "status") return (a.live_status || "").localeCompare(b.live_status || "") * dir;
    return 0;
  });
  const visible = filtered.slice(0, 200);
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "id" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(visible.map((m) => m.id)));
  };

  const checkSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) { alert("Chọn ít nhất 1 model (tick checkbox)"); return; }
    if (ids.length > 20) { if (!confirm(`Check ${ids.length} models sẽ mất ~${ids.length * 2}s và có thể hit rate limit. Tiếp tục?`)) return; }
    setChecking(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/models/health?model=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${mk()}` } });
        const data = await res.json().catch(() => null);
        if (data) setLive((prev) => ({ ...prev, [id]: data }));
      }
    } finally { setChecking(false); }
  };

  return (
    <div>
      <h2>Models ({filtered.length})</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Filter id/provider... (vd: nvidia, gemini...)" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: 8, width: 300, border: "1px solid #ddd", borderRadius: 6 }} />
        <select value={verified} onChange={(e) => setVerified(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}>
          <option value="all">All (316)</option>
          <option value="free">Verified free</option>
          <option value="deprecated">Deprecated</option>
          <option value="unverified">Unverified</option>
        </select>
        <button onClick={fetchModels}>Refresh</button>
        <button onClick={checkSelected} disabled={checking || selected.size === 0} style={{ background: selected.size > 0 ? "#2563eb" : "#f1f5f9", color: selected.size > 0 ? "white" : "#64748b", border: selected.size > 0 ? "1px solid #2563eb" : "1px solid #ddd", opacity: checking ? 0.6 : 1 }}>
          {checking ? "Checking..." : `Check Live (${selected.size})`}
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>{selected.size} selected • tick checkbox để chọn</span>
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Verified: probe 24h (xanh verified, đỏ deprecated, vàng no-key). <b>Live</b>: tick checkbox rồi bấm <code>Check Live</code> để gọi thử <code>POST /v1/chat/completions</code> (8s timeout) — biết model nào thực sự <b>usable</b>.</div>
      <table>
        <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} title="Chọn tất cả visible" /></th><th onClick={() => toggleSort("id")} style={{ cursor: "pointer", userSelect: "none" }}>ID {arrow("id")}</th><th onClick={() => toggleSort("provider")} style={{ cursor: "pointer", userSelect: "none" }}>Provider {arrow("provider")}</th><th onClick={() => toggleSort("context")} style={{ cursor: "pointer", userSelect: "none" }}>Context {arrow("context")}</th><th onClick={() => toggleSort("score")} style={{ cursor: "pointer", userSelect: "none" }}>Score {arrow("score")}</th><th onClick={() => toggleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}>Status {arrow("status")}</th><th>Live</th><th onClick={() => toggleSort("used")} style={{ cursor: "pointer", userSelect: "none" }}>Used / Limit {arrow("used")}</th></tr></thead>
        <tbody>
          {visible.map((m) => {
            const h = live[m.id];
            const used = usage[m.id] || 0;
            return (
              <tr key={m.id} style={{ background: selected.has(m.id) ? "#f0f9ff" : "transparent" }}>
                <td><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /></td>
                <td><code style={{ fontSize: 12 }}>{m.id}</code></td>
                <td style={{ fontSize: 12 }}>{m.owned_by || m.provider}</td>
                <td>{m.context_length ? (m.context_length >= 1000000 ? (m.context_length/1000000)+"M" : m.context_length >= 1000 ? Math.round(m.context_length/1000)+"K" : m.context_length) : "-"}</td>
                <td>{m.score ?? "-"}</td>
                <td>{badge(m.live_status)}</td>
                <td style={{ fontSize: 11 }}>{h ? (h.status === "usable" ? <span style={{ color: "#16a34a" }}>✅ usable {h.latency_ms}ms</span> : h.status === "no-key" ? <span style={{ color: "#854d0e" }}>no-key</span> : <span style={{ color: "#dc2626" }}>{h.status} {h.http_status || ""}</span>) : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                <td style={{ fontSize: 11 }}><span style={{ fontWeight: used > 0 ? 600 : 400 }}>{used}</span> / {parseLimit(m.limit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length > 200 && <p style={{ fontSize: 12, color: "#888" }}>Hiển thị 200/{filtered.length} — dùng filter để thu hẹp.</p>}
      {filtered.length === 0 && <p style={{ fontSize: 12, color: "#888" }}>Không có model nào khớp filter.</p>}
    </div>
  );
}
