import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        <div className="card"><h3>Providers</h3><div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.providers ?? 40}</div><div style={{ fontSize: 12, color: "#666" }}>{stats?.free_models ?? 316} free / 365 total • {stats?.freellms_providers ?? 30} freellms</div></div>
        <div className="card"><h3>Verify (24h)</h3>{verify ? <><div style={{ fontSize: 20, fontWeight: 600, color: verify.total_verified_free > 300 ? "#16a34a" : "#ea580c" }}>{verify.total_verified_free}/{verify.total_freellms_free} verified</div><div style={{ fontSize: 12 }}>{verify.total_deprecated} deprecated • {verify.total_unverified_no_key} unverified</div></> : <span style={{ fontSize: 12 }}>loading / no data</span>}</div>
        <div className="card"><h3>Requests</h3><div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.logs?.total ?? stats?.requests ?? 0}</div><div style={{ fontSize: 12, color: "#666" }}>avg {stats?.logs?.avgLatencyMs ?? 0}ms • {Math.round((stats?.logs?.errorRate || 0) * 100)}% err • {Object.keys(stats?.logs?.byProvider || {}).length} providers</div></div>
        <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}><h3>Tokens</h3><div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>{(stats?.logs?.allTimeTokens ?? 0).toLocaleString()}<span style={{ fontSize: 12, color: "#666", marginLeft: 4 }}>total</span></div><div style={{ fontSize: 11, color: "#666" }}>{(stats?.logs?.promptTokens ?? 0).toLocaleString()} prompt • {(stats?.logs?.completionTokens ?? 0).toLocaleString()} completion • avg {stats?.logs?.avgTokens ?? 0}/req (last 100)</div><div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>All-time tokens</div></div>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3>Requests by Provider (last 100)</h3>
          {stats?.logs?.byProvider && Object.keys(stats.logs.byProvider).length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={Object.entries(stats.logs.byProvider).map(([name, v]) => ({ name, count: v as number }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có data</p>}
        </div>
        <div className="card">
          <h3>Latency (recent 20)</h3>
          {recent.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={[...recent].reverse().map((r) => ({ time: new Date(r.timestamp).toLocaleTimeString(), ms: r.latencyMs }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="ms" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có data</p>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3>Verify Distribution</h3>
          {verify ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={[
                  { name: "verified", value: verify.total_verified_free },
                  { name: "deprecated", value: verify.total_deprecated },
                  { name: "unverified", value: verify.total_unverified_no_key },
                ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  <Cell fill="#16a34a" /><Cell fill="#dc2626" /><Cell fill="#eab308" />
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có verify data</p>}
        </div>
        <div className="card">
          <h3>Recent Logs (5) — tokens</h3>
          {recent.length === 0 ? <p style={{ fontSize: 13, color: "#888" }}>Chưa có request nào — thử gọi <code>POST /v1/chat/completions</code></p> : (
            <table><thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Tokens</th><th>MS</th><th>Status</th></tr></thead>
              <tbody>{recent.map((l) => <tr key={l.id}><td style={{ fontSize: 12 }}>{new Date(l.timestamp).toLocaleTimeString()}</td><td><code>{l.provider}</code></td><td style={{ fontSize: 11 }}>{l.model.split("/").pop()}</td><td style={{ fontSize: 11 }}>{l.totalTokens ?? "-"}<span style={{ color: "#888" }}> ({l.promptTokens ?? 0}+{l.completionTokens ?? 0})</span></td><td>{l.latencyMs}</td><td>{l.status === 200 ? "✅" : "❌"} {l.status}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Tokens by Provider (last 100)</h3>
        {stats?.logs?.tokensByProvider && Object.keys(stats.logs.tokensByProvider).length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={Object.entries(stats.logs.tokensByProvider).map(([name, v]) => ({ name, tokens: v as number }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="tokens" fill="#9333ea" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có data — gọi API để có tokens</p>}
      </div>
    </div>
  );
}
