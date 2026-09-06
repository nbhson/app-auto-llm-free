import { useEffect, useState } from "react";

export default function Models() {
  const [models, setModels] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/v1/models", { headers: { Authorization: "Bearer fgk-master-dev-key" } })
      .then((r) => r.json())
      .then((d) => setModels(d.data || []))
      .catch(() => setModels([]));
  }, []);

  const filtered = models.filter((m) => !q || m.id.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h2>Models ({filtered.length})</h2>
      <input placeholder="Filter..." value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: 8, width: 320, marginBottom: 12, border: "1px solid #ddd", borderRadius: 6 }} />
      <table>
        <thead><tr><th>ID</th><th>Owned by</th><th>Context</th></tr></thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.id}><td><code>{m.id}</code></td><td>{m.owned_by}</td><td>{m.context_length || "-"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
