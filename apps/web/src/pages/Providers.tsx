import { useEffect, useState } from "react";

export default function Providers() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/providers").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  return (
    <div>
      <h2>Providers</h2>
      {!data ? <p>Loading...</p> : (
        <>
          <div className="card">
            <h3>Tiers</h3>
            <pre style={{ fontSize: 12 }}>{JSON.stringify(data.tiers, null, 2)}</pre>
          </div>
          <table>
            <thead><tr><th>Provider</th><th>Keys</th><th>Status</th></tr></thead>
            <tbody>
              {(data.providers || []).map((p: string) => (
                <tr key={p}><td>{p}</td><td>{data.keysConfigured?.[p] || "unknown"}</td><td>stub (P3 health check)</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
