import { useEffect, useState } from "react";

function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

function badge(status?: string) {
  if (status === "verified_free") return <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>verified</span>;
  if (status === "deprecated") return <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>deprecated</span>;
  if (status === "unverified_no_key") return <span style={{ background: "#fef9c3", color: "#854d0e", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>no-key</span>;
  if (status === "public" || status === "alias") return <span style={{ background: "#e0e7ff", color: "#3730a3", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>{status}</span>;
  return <span style={{ background: "#f1f5f9", color: "#64748b", padding: "2px 6px", borderRadius: 10, fontSize: 11 }}>{status || "unverified"}</span>;
}

export default function Models() {
  const [models, setModels] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [verified, setVerified] = useState<string>("all"); // all | free | deprecated | unverified
  const [provider, setProvider] = useState<string>("");

  const fetchModels = () => {
    const params = new URLSearchParams();
    if (provider) params.set("provider", provider);
    if (verified !== "all") params.set("verified", verified);
    fetch(`/v1/models?${params.toString()}`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => r.json())
      .then((d) => setModels(d.data || []))
      .catch(() => setModels([]));
  };

  useEffect(() => { fetchModels(); }, [verified, provider]);

  const filtered = models.filter((m) => !q || m.id.toLowerCase().includes(q.toLowerCase()) || (m.provider || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h2>Models ({filtered.length})</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Filter id/provider..." value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: 8, width: 280, border: "1px solid #ddd", borderRadius: 6 }} />
        <select value={verified} onChange={(e) => setVerified(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}>
          <option value="all">All (316)</option>
          <option value="free">Verified free</option>
          <option value="deprecated">Deprecated</option>
          <option value="unverified">Unverified</option>
        </select>
        <input placeholder="provider (nvidia-nim...)" value={provider} onChange={(e) => setProvider(e.target.value)} style={{ padding: 8, width: 200, border: "1px solid #ddd", borderRadius: 6 }} />
        <button onClick={fetchModels}>Refresh</button>
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Verified: probe live /models mỗi 24h — xanh verified, đỏ deprecated, vàng no-key. Dùng <code>?verified=free</code> để chỉ lấy tier thực sự free.</div>
      <table>
        <thead><tr><th>ID</th><th>Provider</th><th>Context</th><th>Score</th><th>Status</th><th>Limit</th></tr></thead>
        <tbody>
          {filtered.slice(0, 200).map((m) => (
            <tr key={m.id}><td><code style={{ fontSize: 12 }}>{m.id}</code></td><td style={{ fontSize: 12 }}>{m.owned_by || m.provider}</td><td>{m.context_length ? (m.context_length >= 1000000 ? (m.context_length/1000000)+"M" : m.context_length >= 1000 ? Math.round(m.context_length/1000)+"K" : m.context_length) : "-"}</td><td>{m.score ?? "-"}</td><td>{badge(m.live_status)}</td><td style={{ fontSize: 11 }}>{m.limit || "-"}</td></tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 200 && <p style={{ fontSize: 12, color: "#888" }}>Hiển thị 200/{filtered.length} — dùng filter để thu hẹp.</p>}
    </div>
  );
}
