import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [live, setLive] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const load = () => {
    fetch("/api/logs?limit=100", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => setLogs(d.data || [])).catch(() => {});
    fetch("/api/stats", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then(setStats).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!live) return;
    const key = mk();
    const es = new EventSource(`/api/logs/stream`);
    // EventSource can't set headers, fallback to polling for now with interval
    // Use fetch streaming via polling instead
    let timer: any;
    // Actually gateway /api/logs/stream requires auth header, EventSource won't send; use fetch + reader
    (async () => {
      try {
        const res = await fetch("/api/logs/stream", { headers: { Authorization: `Bearer ${key}` } });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const p of parts) {
            const line = p.split("\n").find((l) => l.startsWith("data: "));
            if (line) {
              try {
                const obj = JSON.parse(line.slice(6));
                if (obj.id) setLogs((prev) => [obj, ...prev].slice(0, 100));
              } catch {}
            }
          }
        }
      } catch {}
    })();
    // Fallback polling every 2s
    timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [live]);

  return (
    <div>
      <h2>Logs & Stats</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={load}>Refresh</button>
        <button onClick={() => setLive(!live)} style={{ background: live ? "#dcfce7" : "white" }}>{live ? "● Live ON" : "Live OFF"}</button>
        <span style={{ fontSize: 12, color: "#666", alignSelf: "center" }}>{stats?.logs?.total ?? 0} total • {stats?.logs?.allTimeTokens?.toLocaleString() ?? 0} tokens all-time • avg {stats?.logs?.avgLatencyMs ?? 0}ms/{stats?.logs?.avgTokens ?? 0} tok • {Math.round((stats?.logs?.errorRate || 0) * 100)}% err</span>
      </div>
      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div className="card">
              <h3>Requests by Provider</h3>
              {stats?.logs?.byProvider && Object.keys(stats.logs.byProvider).length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={Object.entries(stats.logs.byProvider).map(([name, v]) => ({ name, count: v as number }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có data</p>}
            </div>
            <div className="card">
              <h3>Tokens by Provider (last 100)</h3>
              {stats?.logs?.tokensByProvider && Object.keys(stats.logs.tokensByProvider).length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={Object.entries(stats.logs.tokensByProvider).map(([name, v]) => ({ name, tokens: v as number }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="tokens" fill="#9333ea" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có data</p>}
            </div>
            <div className="card">
              <h3>Status Distribution</h3>
              {stats?.logs?.total > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={[
                      { name: "success", value: 100 - Math.round((stats.logs.errorRate || 0) * 100) },
                      { name: "error", value: Math.round((stats.logs.errorRate || 0) * 100) },
                    ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                      <Cell fill="#16a34a" /><Cell fill="#dc2626" />
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p style={{ fontSize: 12, color: "#888" }}>Chưa có data</p>}
            </div>
          </div>
          <div className="card" style={{ fontSize: 12, marginBottom: 12 }}><b>Tokens:</b> {(stats.logs.totalTokens ?? 0).toLocaleString()} last 100 ({(stats.logs.promptTokens ?? 0).toLocaleString()} prompt + {(stats.logs.completionTokens ?? 0).toLocaleString()} completion, avg {stats.logs.avgTokens ?? 0}/req) • <b>All-time:</b> {(stats.logs.allTimeTokens ?? 0).toLocaleString()} • <b>By provider:</b> {Object.entries(stats.logs.tokensByProvider || {}).map(([k, v]) => `${k}:${(v as number).toLocaleString()}`).join(" • ") || "—"}</div>
        </>
      )}
      {stats?.logs?.byProvider && <div className="card" style={{ fontSize: 12 }}><b>By provider (last 100):</b> {Object.entries(stats.logs.byProvider).map(([k, v]) => `${k}:${v}`).join(" • ") || "—"}</div>}
      <table>
        <thead><tr><th>Time</th><th>Key</th><th>Provider</th><th>Model</th><th>Tokens</th><th>MS</th><th>Status</th><th>Verified</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}><td style={{ fontSize: 11 }}>{new Date(l.timestamp).toLocaleTimeString()}</td><td style={{ fontSize: 11 }}>{l.virtualKeyName || l.virtualKeyId || "-"}</td><td><code style={{ fontSize: 11 }}>{l.provider}</code></td><td style={{ fontSize: 11 }}>{l.model}</td><td style={{ fontSize: 11 }}>{l.totalTokens ?? "-"}</td><td>{l.latencyMs}</td><td>{l.status === 200 ? <span style={{ color: "#16a34a" }}>200</span> : <span style={{ color: "#dc2626" }}>{l.status}</span>}</td><td style={{ fontSize: 11 }}>{l.verifiedStatus || "-"}</td></tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p style={{ fontSize: 12, color: "#888" }}>Chưa có log — gọi <code>POST /v1/chat/completions</code> để tạo.</p>}
    </div>
  );
}
