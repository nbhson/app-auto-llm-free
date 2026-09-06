import { useEffect, useState } from "react";

export default function Dashboard() {
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch("/v1/health").then((r) => r.json()).then(setHealth).catch(() => {});
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div>
      <h2>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h3>Gateway Health</h3>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(health, null, 2) || "loading..."}</pre>
        </div>
        <div className="card">
          <h3>Stats</h3>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(stats, null, 2) || "loading..."}</pre>
        </div>
      </div>
      <div className="card">
        <h3>Quick Test</h3>
        <code>curl http://localhost:8080/v1/chat/completions -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"{"}model":"auto","messages":[{"{"}role":"user","content":"Hello"{"}"}]{"}"}'</code>
        <p style={{ fontSize: 13, color: "#555" }}>Mặc định dev cho phép bất kỳ <code>fgk-...</code> key nào. Cấu hình key thật trong <code>.env</code>.</p>
      </div>
    </div>
  );
}
