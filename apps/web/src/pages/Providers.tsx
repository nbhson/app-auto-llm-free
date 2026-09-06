import { useEffect, useState } from "react";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Providers() {
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const load = () => {
    fetch("/api/providers", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setData).catch(() => {});
  };
  const checkHealth = () => {
    setLoadingHealth(true);
    fetch("/api/providers/health", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setHealth).finally(() => setLoadingHealth(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h2>Providers ({data?.count ?? 40})</h2>
      {!data ? <p>Loading...</p> : (
        <>
          <div className="card">
            <h3>Tiers (FALLBACK_TIERS)</h3>
            <pre style={{ fontSize: 11 }}>{JSON.stringify(data.tiers, null, 2)}</pre>
            <button onClick={checkHealth} disabled={loadingHealth}>{loadingHealth ? "Checking..." : "Live Health Check (40 providers, 5s)"}</button>
            {health && <pre style={{ fontSize: 11, maxHeight: 200, overflow: "auto", marginTop: 8 }}>{JSON.stringify(health.summary || health, null, 2)}</pre>}
          </div>
          <table>
            <thead><tr><th>Provider</th><th>Tier</th><th>Free</th><th>Keys</th><th>Health</th><th>Caps</th></tr></thead>
            <tbody>
              {(data.detailed || []).map((p: any) => {
                const h = health?.providers?.find((x: any) => x.id === p.id);
                return (
                  <tr key={p.id}>
                    <td><code style={{ fontSize: 12 }}>{p.id}</code><div style={{ fontSize: 11, color: "#666" }}>{p.name}</div></td>
                    <td><span style={{ fontSize: 11, background: p.tier_type === "permanent" ? "#dcfce7" : "#fef9c3", padding: "2px 6px", borderRadius: 10 }}>{p.tier || p.tier_type}</span></td>
                    <td style={{ fontSize: 12 }}>{p.free_models}</td>
                    <td style={{ fontSize: 12 }}>{p.keys} {h && h.status !== "no-key" && <span style={{ fontSize: 11, color: h.status === "online" ? "#16a34a" : "#dc2626" }}>• {h.status} {h.latency_ms}ms</span>}</td>
                    <td style={{ fontSize: 11 }}>{p.status} {h?.breaker === "open" && <span style={{ color: "#dc2626" }}>[breaker open]</span>}</td>
                    <td style={{ fontSize: 11 }}>{(p.caps || []).slice(0, 3).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
