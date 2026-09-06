import { useEffect, useState } from "react";
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
  const [hasKeyOnly, setHasKeyOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
  useEffect(() => { setPage(1); }, [qDebounced, limit, hasKeyOnly]);

  const toggleSort = (col: string) => setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "provider" ? "asc" : "desc" }));
  const arrow = (col: string) => (sort.col !== col ? "↕" : sort.dir === "asc" ? "↑" : "↓");

  return (
    <div>
      <h2>{t("providers.title")} ({data?.pagination?.total ?? data?.count ?? 40})</h2>
      {!data ? <p>Loading...</p> : (
        <>
          <div className="card">
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{t("providers.tiers")}</h3>
              <span style={{ fontSize: 11, color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 20 }}>{data?.pagination?.total ?? data?.count ?? 0} providers</span>
            </div>
            <pre style={{ fontSize: 11, marginBottom: 12 }}>{JSON.stringify(data.tiers, null, 2)}</pre>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "0 1 260px" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>🔍</span>
                <input placeholder={t("providers.filter")} value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: "8px 12px 8px 32px", width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, background: "white" }} />
              </div>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 500, background: hasKeyOnly ? "#dcfce7" : "white", border: `1px solid ${hasKeyOnly ? "#86efac" : "#e2e8f0"}`, padding: "7px 12px", borderRadius: 20, cursor: "pointer", color: hasKeyOnly ? "#166534" : "#475569" }}><input type="checkbox" checked={hasKeyOnly} onChange={(e) => setHasKeyOnly(e.target.checked)} style={{ accentColor: "#16a34a" }} /> {t("providers.hasKey")}</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <button onClick={syncLive} disabled={syncing} style={{ background: syncing ? "#f1f5f9" : "#16a34a", color: syncing ? "#64748b" : "white", border: `1px solid ${syncing ? "#e2e8f0" : "#16a34a"}`, display: "flex", gap: 6, alignItems: "center" }}>{syncing ? `⏳ ${t("providers.syncing")}` : t("providers.sync")}</button>
                <button onClick={checkHealth} disabled={loadingHealth} style={{ display: "flex", gap: 6, alignItems: "center" }}>{loadingHealth ? `⏳ ${t("providers.checking")}` : `● ${t("providers.live_check")}`}</button>
              </div>
            </div>
            {health && <pre style={{ fontSize: 11, maxHeight: 200, overflow: "auto", marginTop: 10, background: "white" }}>{JSON.stringify(health.summary || health, null, 2)}</pre>}
          </div>
          <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th onClick={() => toggleSort("provider")} style={{ cursor: "pointer", userSelect: "none" }}>{t("providers.th_provider")} {arrow("provider")}</th>
              <th onClick={() => toggleSort("tier")} style={{ cursor: "pointer", userSelect: "none" }}>{t("providers.th_tier")} {arrow("tier")}</th>
              <th onClick={() => toggleSort("free")} style={{ cursor: "pointer", userSelect: "none" }}>{t("providers.th_free")} {arrow("free")}</th>
              <th onClick={() => toggleSort("keys")} style={{ cursor: "pointer", userSelect: "none" }}>{t("providers.th_keys")} {arrow("keys")}</th>
              <th>{t("providers.th_health")}</th>
              <th>{t("providers.th_caps")}</th>
              <th>{t("providers.th_base")}</th>
              <th>{t("providers.th_getkey")}</th>
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
                const hasKey = p.hasRealKey;
                return (
                  <tr key={p.id} style={hasKey ? { background: "#f0fdf4", borderLeft: "3px solid #16a34a" } : {}}>
                    <td><code style={{ fontSize: 12 }}>{p.id}</code><div style={{ fontSize: 11, color: "#666" }}>{p.name}</div>{hasKey && <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>● has key</div>}</td>
                    <td><span style={{ fontSize: 11, background: p.tier_type === "permanent" ? "#dcfce7" : "#fef9c3", padding: "2px 6px", borderRadius: 10 }}>{p.tier || p.tier_type}</span></td>
                    <td style={{ fontSize: 12 }}>{p.free_models}</td>
                    <td style={{ fontSize: 12, background: hasKey ? "#dcfce7" : "transparent", borderRadius: 6, padding: "4px 6px" }}>{p.keys} {hasKey && <span style={{ fontSize: 10, color: "#166534", background: "#bbf7d0", padding: "1px 5px", borderRadius: 10, marginLeft: 4 }}>✓ real</span>} {h && h.status !== "no-key" && <span style={{ fontSize: 11, color: h.status === "online" ? "#16a34a" : "#dc2626" }}>• {h.status} {h.latency_ms}ms</span>}</td>
                    <td style={{ fontSize: 11 }}>{p.status} {h?.breaker === "open" && <span style={{ color: "#dc2626" }}>[breaker open]</span>}</td>
                    <td style={{ fontSize: 11 }}>{(p.caps || []).slice(0, 3).join(", ")}</td>
                    <td style={{ fontSize: 11, maxWidth: 220, wordBreak: "break-all" }}>{baseUrl ? <><code style={{ fontSize: 11, wordBreak: "break-all" }}>{baseUrl}</code><button onClick={() => navigator.clipboard.writeText(baseUrl)} style={{ marginLeft: 6, fontSize: 11, padding: "2px 6px" }} title="Copy">⎘</button></> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td><a href={getKeyUrl(p.id)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, background: hasKey ? "#16a34a" : "#2563eb", color: "white", padding: "4px 10px", borderRadius: 6, textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" }}>{hasKey ? "✓ Key" : "Get Key ↗"}</a><div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}><a href={`https://freellms.org/providers/${p.id}`} target="_blank" rel="noopener" style={{ color: "#64748b" }}>freellms ↗</a></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 12px", display: "flex", gap: 12, alignItems: "center", zIndex: 10, boxShadow: "0 -2px 8px rgba(0,0,0,0.04)" }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!data?.pagination?.has_prev}>{t("common.prev")}</button>
            <span style={{ fontSize: 12 }}>{t("common.page")} {data?.pagination?.page ?? 1} / {data?.pagination?.total_pages ?? 1} • {data?.pagination?.total ?? data?.count ?? 0} providers</span>
            <button onClick={() => setPage((p) => Math.min(data?.pagination?.total_pages ?? 1, p + 1))} disabled={!data?.pagination?.has_next}>{t("common.next")}</button>
            <label style={{ fontSize: 12, marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>{t("models.lov")} <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white" }}><option value={25}>25</option><option value={50}>50</option></select></label>
          </div>
        </>
      )}
    </div>
  );
}
