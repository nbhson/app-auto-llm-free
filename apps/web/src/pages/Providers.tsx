import { useEffect, useState } from "react";
import { getKeyUrl } from "../lib/getKeyUrls";
import { getBaseUrl } from "../lib/getBaseUrls";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Providers() {
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "free", dir: "desc" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [q, setQ] = useState("");

  const load = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.set("q", q);
    fetch(`/api/providers?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setData).catch(() => {});
  };
  const checkHealth = () => {
    setLoadingHealth(true);
    fetch("/api/providers/health", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setHealth).finally(() => setLoadingHealth(false));
  };

  useEffect(() => { load(); }, [page, limit, q]);
  useEffect(() => { setPage(1); }, [q, limit]);

  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "provider" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");

  return (
    <div>
      <h2>Providers ({data?.pagination?.total ?? data?.count ?? 40})</h2>
      {!data ? <p>Loading...</p> : (
        <>
          <div className="card">
            <h3>Tiers (FALLBACK_TIERS)</h3>
            <pre style={{ fontSize: 11 }}>{JSON.stringify(data.tiers, null, 2)}</pre>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input placeholder="Filter provider..." value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: 6, width: 220, border: "1px solid #ddd", borderRadius: 6 }} />
              <label style={{ fontSize: 12 }}>LOV <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} style={{ padding: 6, border: "1px solid #ddd", borderRadius: 6 }}><option value={25}>25</option><option value={50}>50</option></select></label>
              <button onClick={checkHealth} disabled={loadingHealth}>{loadingHealth ? "Checking..." : "Live Health Check (40 providers, 5s)"}</button>
            </div>
            {health && <pre style={{ fontSize: 11, maxHeight: 200, overflow: "auto", marginTop: 8 }}>{JSON.stringify(health.summary || health, null, 2)}</pre>}
          </div>
          <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th onClick={() => toggleSort("provider")} style={{ cursor: "pointer", userSelect: "none" }}>Provider {arrow("provider")}</th>
              <th onClick={() => toggleSort("tier")} style={{ cursor: "pointer", userSelect: "none" }}>Tier {arrow("tier")}</th>
              <th onClick={() => toggleSort("free")} style={{ cursor: "pointer", userSelect: "none" }}>Free {arrow("free")}</th>
              <th onClick={() => toggleSort("keys")} style={{ cursor: "pointer", userSelect: "none" }}>Keys {arrow("keys")}</th>
              <th>Health</th>
              <th>Caps</th>
              <th>Base URL</th>
              <th>Get Key</th>
            </tr></thead>
            <tbody>
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
                return (
                  <tr key={p.id}>
                    <td><code style={{ fontSize: 12 }}>{p.id}</code><div style={{ fontSize: 11, color: "#666" }}>{p.name}</div></td>
                    <td><span style={{ fontSize: 11, background: p.tier_type === "permanent" ? "#dcfce7" : "#fef9c3", padding: "2px 6px", borderRadius: 10 }}>{p.tier || p.tier_type}</span></td>
                    <td style={{ fontSize: 12 }}>{p.free_models}</td>
                    <td style={{ fontSize: 12 }}>{p.keys} {h && h.status !== "no-key" && <span style={{ fontSize: 11, color: h.status === "online" ? "#16a34a" : "#dc2626" }}>• {h.status} {h.latency_ms}ms</span>}</td>
                    <td style={{ fontSize: 11 }}>{p.status} {h?.breaker === "open" && <span style={{ color: "#dc2626" }}>[breaker open]</span>}</td>
                    <td style={{ fontSize: 11 }}>{(p.caps || []).slice(0, 3).join(", ")}</td>
                    <td style={{ fontSize: 11, maxWidth: 220, wordBreak: "break-all" }}>{baseUrl ? <><code style={{ fontSize: 11, wordBreak: "break-all" }}>{baseUrl}</code><button onClick={() => navigator.clipboard.writeText(baseUrl)} style={{ marginLeft: 6, fontSize: 11, padding: "2px 6px" }} title="Copy">⎘</button></> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td><a href={getKeyUrl(p.id)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, background: "#2563eb", color: "white", padding: "4px 10px", borderRadius: 6, textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" }}>Get Key ↗</a><div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}><a href={`https://freellms.org/providers/${p.id}`} target="_blank" rel="noopener" style={{ color: "#64748b" }}>freellms ↗</a></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 0", display: "flex", gap: 8, alignItems: "center", zIndex: 10, boxShadow: "0 -2px 8px rgba(0,0,0,0.04)" }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!data?.pagination?.has_prev}>‹ Prev</button>
            <span style={{ fontSize: 12 }}>Page {data?.pagination?.page ?? 1} / {data?.pagination?.total_pages ?? 1} • {data?.pagination?.total ?? data?.count ?? 0} providers</span>
            <button onClick={() => setPage((p) => Math.min(data?.pagination?.total_pages ?? 1, p + 1))} disabled={!data?.pagination?.has_next}>Next ›</button>
            <span style={{ fontSize: 11, color: "#888" }}>LOV {limit}/page</span>
          </div>
        </>
      )}
    </div>
  );
}
