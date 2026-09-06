import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

function randHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
          <h3>Recent Logs (5)</h3>
          {recent.length === 0 ? <p style={{ fontSize: 13, color: "#888" }}>Chưa có request nào — thử gọi <code>POST /v1/chat/completions</code></p> : (
            <table><thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>MS</th><th>Status</th></tr></thead>
              <tbody>{recent.map((l) => <tr key={l.id}><td style={{ fontSize: 12 }}>{new Date(l.timestamp).toLocaleTimeString()}</td><td><code>{l.provider}</code></td><td style={{ fontSize: 12 }}>{l.model}</td><td>{l.latencyMs}</td><td>{l.status === 200 ? "✅" : "❌"} {l.status}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3>🔑 Key Generator (thay openssl)</h3>
        <p style={{ fontSize: 12, color: "#555" }}>Tạo <code>MASTER_KEY</code> và <code>ENCRYPTION_KEY</code> ngay trên trình duyệt (client-side, không gửi server). Dùng thay cho <code>openssl rand -hex</code>.</p>
        <KeyGen />
      </div>
    </div>
  );
}

function KeyGen() {
  const [master, setMaster] = useState("");
  const [enc, setEnc] = useState("");
  const gen = () => {
    setMaster(`fgk-master-${randHex(16)}`);
    setEnc(randHex(32));
  };
  useEffect(() => { gen(); }, []);
  const useMaster = () => {
    localStorage.setItem("masterKey", master);
    alert("Đã lưu MASTER_KEY vào ô header (localStorage). Nhớ copy vào .env và restart gateway!");
    location.reload();
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><button onClick={gen}>🎲 Generate mới</button><span style={{ fontSize: 11, color: "#666", alignSelf: "center" }}>Mỗi lần bấm sẽ tạo cặp mới, không gửi server</span></div>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontSize: 12 }}>MASTER_KEY <div style={{ display: "flex", gap: 6 }}><code style={{ flex: 1, wordBreak: "break-all", background: "#f1f5f9", padding: "6px 8px", borderRadius: 6 }}>{master}</code><button onClick={() => navigator.clipboard.writeText(master)}>Copy</button><button onClick={useMaster} style={{ background: "#dcfce7" }}>Use in UI</button></div></label>
        <label style={{ fontSize: 12 }}>ENCRYPTION_KEY (64 hex) <div style={{ display: "flex", gap: 6 }}><code style={{ flex: 1, wordBreak: "break-all", background: "#f1f5f9", padding: "6px 8px", borderRadius: 6 }}>{enc}</code><button onClick={() => navigator.clipboard.writeText(enc)}>Copy</button></div></label>
      </div>
      <pre style={{ fontSize: 11, background: "#f8fafc", padding: 8, borderRadius: 6, overflow: "auto", marginTop: 8 }}>{`# Dán vào .env và restart\nMASTER_KEY=${master}\nENCRYPTION_KEY=${enc}`}</pre>
      <p style={{ fontSize: 11, color: "#888" }}>Lưu ý: <code>MASTER_KEY</code> dùng để đăng nhập Dashboard và <code>POST /api/keys</code> tạo <code>fgk-...</code> cho app. <code>/keys</code> tạo <code>fgk-...</code> <b>không thể</b> thay thế <code>MASTER_KEY</code> — vì tạo <code>fgk-...</code> cần <code>MASTER_KEY</code> trước.</p>
    </div>
  );
}
