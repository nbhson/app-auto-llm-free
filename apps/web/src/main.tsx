import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard.tsx";
import Models from "./pages/Models.tsx";
import Providers from "./pages/Providers.tsx";
import Keys from "./pages/Keys.tsx";
import Logs from "./pages/Logs.tsx";
import "./index.css";

function getMasterKey() {
  return localStorage.getItem("masterKey") || "fgk-master-dev-key";
}

function Layout({ children }: { children: React.ReactNode }) {
  const [masterKey, setMasterKey] = React.useState(getMasterKey());
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>⚡ Free LLM Gateway</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Dashboard</Link>
          <Link to="/models">Models</Link>
          <Link to="/providers">Providers</Link>
          <Link to="/keys">Keys</Link>
          <Link to="/logs">Logs</Link>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>30 providers • 316 free</span>
          <input
            value={masterKey}
            onChange={(e) => { setMasterKey(e.target.value); localStorage.setItem("masterKey", e.target.value); }}
            placeholder="fgk-master-..."
            style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, width: 180 }}
            title="Master key for /api"
          />
        </div>
      </header>
      {children}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/models" element={<Models />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/keys" element={<Keys />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </React.StrictMode>
);
