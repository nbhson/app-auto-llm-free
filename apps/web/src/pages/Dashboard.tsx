import { useEffect, useState } from "react";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Dashboard() {
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [verify, setVerify] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    fetch("/v1/health").then((r) => r.json()).then(setHealth).catch(() => {});
    const key = mk();
    fetch("/api/stats", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).then(setStats).catch(() => {});
    fetch("/api/verify/summary", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).then(setVerify).catch(() => {});
    fetch("/api/logs?limit=5", { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).then((d) => setRecent(d.data || [])).catch(() => {});
  }, []);

  return (
    <div>
      <h2>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="card"><h3>Providers</h3><div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.providers ?? 40}</div><div style={{ fontSize: 12, color: "#666" }}>{stats?.free_models ?? 316} free / 365 total • {stats?.freellms_providers ?? 30} freellms</div></div>
        <div className="card"><h3>Verify (24h)</h3>{verify ? <><div style={{ fontSize: 20, fontWeight: 600, color: verify.total_verified_free > 300 ? "#16a34a" : "#ea580c" }}>{verify.total_verified_free}/{verify.total_freellms_free} verified</div><div style={{ fontSize: 12 }}>{verify.total_deprecated} deprecated • {verify.total_unverified_no_key} unverified_no_key</div></> : <span style={{ fontSize: 12 }}>loading / no data — run POST /api/verify</span>}</div>
        <div className="card"><h3>Requests</h3><div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.logs?.total ?? stats?.requests ?? 0}</div><div style={{ fontSize: 12, color: "#666" }}>avg {stats?.logs?.avgLatencyMs ?? 0}ms • {Math.round((stats?.logs?.errorRate || 0) * 100)}% errors • {Object.keys(stats?.logs?.byProvider || {}).length} providers used</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3>Gateway Health</h3>
          <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 220 }}>{JSON.stringify(health, null, 2) || "loading..."}</pre>
        </div>
        <div className="card">
          <h3>Stats Detail</h3>
          <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 220 }}>{JSON.stringify(stats, null, 2) || "loading..."}</pre>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Recent Logs (5)</h3>
        {recent.length === 0 ? <p style={{ fontSize: 13, color: "#888" }}>Chưa có request nào — thử gọi <code>POST /v1/chat/completions</code></p> : (
          <table><thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>MS</th><th>Status</th></tr></thead>
            <tbody>{recent.map((l) => <tr key={l.id}><td style={{ fontSize: 12 }}>{new Date(l.timestamp).toLocaleTimeString()}</td><td><code>{l.provider}</code></td><td style={{ fontSize: 12 }}>{l.model}</td><td>{l.latencyMs}</td><td>{l.status === 200 ? "✅" : "❌"} {l.status}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Quick Test</h3>
        <code style={{ display: "block", whiteSpace: "pre-wrap", fontSize: 12 }}>{`curl http://localhost:8080/v1/chat/completions -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`}</code>
        <p style={{ fontSize: 13, color: "#555" }}>Mặc định dev cho phép bất kỳ <code>fgk-...</code> key nào. Tạo key riêng trong <b>Keys</b> với scope model/provider và RPM limit.</p>
      </div>
    </div>
  );
}
