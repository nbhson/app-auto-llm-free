import { useEffect, useState } from "react";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }

export default function Keys() {
  const [keys, setKeys] = useState<any[]>([]);
  const [name, setName] = useState("my-app");
  const [scopes, setScopes] = useState('{"models":["*"],"providers":["*"]}');
  const [rpm, setRpm] = useState("60");
  const [lastCreated, setLastCreated] = useState<any>(null);

  const load = () => {
    fetch("/api/keys", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => setKeys(d.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    let sc: any;
    try { sc = JSON.parse(scopes); } catch { alert("scopes JSON invalid"); return; }
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, scopes: sc, rpmLimit: parseInt(rpm, 10) }),
    });
    const data = await res.json();
    if (!res.ok) alert(JSON.stringify(data));
    else { setLastCreated(data); load(); }
  };

  const del = async (id: string) => {
    if (!confirm(`Delete ${id}?`)) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${mk()}` } });
    load();
  };

  return (
    <div>
      <h2>Virtual Keys ({keys.length})</h2>
      <div className="card">
        <h3>Create fgk-...</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label>Name <input value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 6, border: "1px solid #ddd", borderRadius: 6, marginLeft: 4 }} /></label>
          <label>RPM <input value={rpm} onChange={(e) => setRpm(e.target.value)} style={{ width: 80, padding: 6, border: "1px solid #ddd", borderRadius: 6, marginLeft: 4 }} /></label>
          <label>Scopes <input value={scopes} onChange={(e) => setScopes(e.target.value)} style={{ width: 320, padding: 6, border: "1px solid #ddd", borderRadius: 6, marginLeft: 4 }} /></label>
          <button onClick={create}>Create</button>
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>Scopes: <code>{"{"}models: ["*"] or ["nvidia-nim/z-ai/glm-5.2"], providers: ["*"] or ["groq"]{"}"}</code> — key sẽ có <code>fgk-...</code> chỉ hiện 1 lần.</div>
        {lastCreated && <div style={{ marginTop: 12, padding: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}><div style={{ fontSize: 12, fontWeight: 600 }}>Created: {lastCreated.name} ({lastCreated.id})</div><code style={{ fontSize: 12, wordBreak: "break-all" }}>{lastCreated.key}</code><div style={{ fontSize: 11, color: "#666" }}>Copy ngay — sẽ không hiện lại!</div></div>}
      </div>

      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Scopes</th><th>RPM</th><th>Requests</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}><td style={{ fontSize: 12 }}><code>{k.id}</code></td><td>{k.name}</td><td><span style={{ fontSize: 11, background: k.role === "admin" ? "#fee2e2" : "#e0f2fe", padding: "2px 6px", borderRadius: 10 }}>{k.role}</span></td><td style={{ fontSize: 11 }}>{JSON.stringify(k.scopes)}</td><td>{k.rpmLimit}</td><td>{k.requestCount ?? 0}</td><td style={{ fontSize: 11 }}>{new Date(k.createdAt).toLocaleDateString()}</td><td>{k.id !== "vk-master" && <button onClick={() => del(k.id)} style={{ fontSize: 12, padding: "4px 8px" }}>Delete</button>}</td></tr>
          ))}
        </tbody>
      </table>
      {keys.length === 0 && <p style={{ fontSize: 12, color: "#888" }}>No keys — tạo key đầu tiên ở trên, hoặc dùng <code>MASTER_KEY</code>.</p>}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Quick Test</h3>
        <p style={{ fontSize: 12, color: "#555" }}>Dùng <code>fgk-...</code> vừa tạo để gọi gateway (thay <code>$FGK_KEY</code> bằng key vừa copy):</p>
        <code style={{ display: "block", whiteSpace: "pre-wrap", fontSize: 12, background: "#f8fafc", padding: 8, borderRadius: 6, overflow: "auto" }}>{`curl http://localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer $FGK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`}</code>
        <p style={{ fontSize: 12, color: "#555", marginTop: 8 }}>Hoặc với <code>x-router</code> pin provider public (không cần provider key):</p>
        <code style={{ display: "block", whiteSpace: "pre-wrap", fontSize: 12, background: "#f8fafc", padding: 8, borderRadius: 6, overflow: "auto" }}>{`curl http://localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer $FGK_KEY" -H "x-router: pollinations" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}]}'`}</code>
      </div>
    </div>
  );
}
