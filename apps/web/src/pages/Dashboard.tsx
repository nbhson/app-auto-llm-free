import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { useLang } from "../lib/i18n.tsx";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Dashboard() {
  const { t } = useLang();
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
      <h2>{t("dashboard.title")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        <div className="card"><h3>{t("dashboard.providers")}</h3><div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.providers ?? 40}</div><div style={{ fontSize: 12, color: "#666" }}>{stats?.free_models ?? 316} free / 365 total • {stats?.freellms_providers ?? 30} freellms</div></div>
        <div className="card"><h3>{t("dashboard.verify")}</h3>{verify ? <><div style={{ fontSize: 20, fontWeight: 600, color: verify.total_verified_free > 300 ? "#16a34a" : "#ea580c" }}>{verify.total_verified_free}/{verify.total_freellms_free} verified</div><div style={{ fontSize: 12 }}>{verify.total_deprecated} deprecated • {verify.total_unverified_no_key} unverified</div></> : <span style={{ fontSize: 12 }}>loading / no data</span>}</div>
        <div className="card"><h3>{t("dashboard.requests")}</h3><div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.logs?.total ?? stats?.requests ?? 0}</div><div style={{ fontSize: 12, color: "#666" }}>avg {stats?.logs?.avgLatencyMs ?? 0}ms • {Math.round((stats?.logs?.errorRate || 0) * 100)}% err • {Object.keys(stats?.logs?.byProvider || {}).length} providers</div></div>
        <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}><h3>{t("dashboard.tokens")}</h3><div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>{(stats?.logs?.allTimeTokens ?? 0).toLocaleString()}<span style={{ fontSize: 12, color: "#666", marginLeft: 4 }}>total</span></div><div style={{ fontSize: 11, color: "#666" }}>{(stats?.logs?.promptTokens ?? 0).toLocaleString()} prompt • {(stats?.logs?.completionTokens ?? 0).toLocaleString()} completion • avg {stats?.logs?.avgTokens ?? 0}/req (last 100)</div><div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>All-time tokens</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ minWidth: 0, overflow: "hidden" }}>
          <h3>{t("dashboard.gateway_health")}</h3>
          <pre style={{ fontSize: 11, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere", margin: 0 }}>{JSON.stringify(health, null, 2) || "loading..."}</pre>
        </div>
        <div className="card" style={{ minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{t("dashboard.stats_detail")}</h3>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(stats, null, 2))} style={{ fontSize: 11, padding: "4px 8px" }}>Copy</button>
          </div>
          <pre style={{ fontSize: 11, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere", margin: 0, maxWidth: "100%" }}>{JSON.stringify(stats, null, 2).slice(0, 4000) || "loading..."}{JSON.stringify(stats, null, 2).length > 4000 ? "\n... (truncated, Copy để xem đủ)" : ""}</pre>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3>{t("dashboard.requests_by_provider")}</h3>
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
          ) : <p style={{ fontSize: 12, color: "#888" }}>{t("dashboard.no_data")}</p>}
        </div>
        <div className="card">
          <h3>{t("dashboard.latency")}</h3>
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
          ) : <p style={{ fontSize: 12, color: "#888" }}>{t("dashboard.no_data")}</p>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3>{t("dashboard.verify_dist")}</h3>
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
          ) : <p style={{ fontSize: 12, color: "#888" }}>{t("dashboard.no_verify")}</p>}
        </div>
        <div className="card">
          <h3>{t("dashboard.recent_logs")}</h3>
          {recent.length === 0 ? <p style={{ fontSize: 13, color: "#888" }}>{t("dashboard.no_requests")}</p> : (
            <table><thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Tokens</th><th>MS</th><th>Status</th></tr></thead>
              <tbody>{recent.map((l) => <tr key={l.id}><td style={{ fontSize: 12 }}>{new Date(l.timestamp).toLocaleTimeString()}</td><td><code>{l.provider}</code></td><td style={{ fontSize: 11 }}>{l.model.split("/").pop()}</td><td style={{ fontSize: 11 }}>{l.totalTokens ?? "-"}<span style={{ color: "#888" }}> ({l.promptTokens ?? 0}+{l.completionTokens ?? 0})</span></td><td>{l.latencyMs}</td><td>{l.status === 200 ? "✅" : "❌"} {l.status}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>{t("dashboard.tokens_by_provider")}</h3>
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
        ) : <p style={{ fontSize: 12, color: "#888" }}>{t("dashboard.no_tokens")}</p>}
      </div>
    </div>
  );
}
