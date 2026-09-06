import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard.tsx";
import Models from "./pages/Models.tsx";
import Providers from "./pages/Providers.tsx";
import Keys from "./pages/Keys.tsx";
import "./index.css";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>⚡ Free LLM Gateway</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Dashboard</Link>
          <Link to="/models">Models</Link>
          <Link to="/providers">Providers</Link>
          <Link to="/keys">Keys</Link>
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>Hono + React • OpenAI Compatible</span>
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
        </Routes>
      </Layout>
    </BrowserRouter>
  </React.StrictMode>
);
