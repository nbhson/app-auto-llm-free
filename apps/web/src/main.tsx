import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard.tsx";
import Models from "./pages/Models.tsx";
import Providers from "./pages/Providers.tsx";
import Keys from "./pages/Keys.tsx";
import Logs from "./pages/Logs.tsx";
import "./index.css";
import { LangProvider, useLang } from "./lib/i18n.tsx";

function getMasterKey() {
  return localStorage.getItem("masterKey") || "fgk-master-dev-key";
}

const navItems = [
  { to: "/", label: "Dashboard", icon: "◈", end: true },
  { to: "/providers", label: "Providers", icon: "⬡", desc: "30" },
  { to: "/models", label: "Models", icon: "◫", desc: "316" },
  { to: "/keys", label: "Keys", icon: "🔑" },
  { to: "/logs", label: "Logs", icon: "≡" },
];

function LayoutInner({ children }: { children: React.ReactNode }) {
  const [masterKey, setMasterKey] = React.useState(getMasterKey());
  const [health, setHealth] = React.useState<"ok" | "down" | "loading">("loading");
  const { lang, setLang, t } = useLang();
  const navItemsLocal = [
    { to: "/", label: t("nav.dashboard"), icon: "◈", end: true },
    { to: "/providers", label: t("nav.providers"), icon: "⬡", desc: "30" },
    { to: "/models", label: t("nav.models"), icon: "◫", desc: "316" },
    { to: "/keys", label: t("nav.keys"), icon: "🔑" },
    { to: "/logs", label: t("nav.logs"), icon: "≡" },
  ];
  React.useEffect(() => {
    fetch("/v1/health").then((r) => (r.ok ? setHealth("ok") : setHealth("down"))).catch(() => setHealth("down"));
  }, []);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: "0 24px 24px" }}>
      <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(250,250,250,0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid #e2e8f0", margin: "0 -24px 24px", padding: "12px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", width: "100%" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "0 1 auto", minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, whiteSpace: "nowrap" }}>⚡ Free LLM Gateway</span>
            <span style={{ fontSize: 11, background: health === "ok" ? "#dcfce7" : health === "down" ? "#fee2e2" : "#f1f5f9", color: health === "ok" ? "#166534" : "#991b1b", padding: "2px 8px", borderRadius: 10, border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{health === "ok" ? t("header.online") : health === "down" ? t("header.offline") : t("header.loading")}</span>
            <span style={{ fontSize: 11, color: "#64748b", background: "white", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>{t("header.providers_free")}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "0 0 auto", marginLeft: "auto" }}>
            <select value={lang} onChange={(e) => setLang(e.target.value as any)} style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 8, background: "white" }} title="Language / Ngôn ngữ">
              <option value="vi">🇻🇳 VI</option>
              <option value="en">🇬🇧 EN</option>
            </select>
            <span style={{ fontSize: 11, color: "#64748b" }}>{t("header.master")}</span>
            <input
              value={masterKey}
              onChange={(e) => { setMasterKey(e.target.value); localStorage.setItem("masterKey", e.target.value); }}
              placeholder="fgk-master-..."
              style={{ fontSize: 12, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, width: 180, background: "white" }}
              title="Master key for /api (admin)"
            />
          </div>
        </div>
        <nav style={{ display: "flex", gap: 6, background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 4, alignSelf: "center" }}>
          {navItemsLocal.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                textDecoration: "none",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#0f172a" : "#475569",
                background: isActive ? "#f1f5f9" : "transparent",
                padding: "6px 12px",
                borderRadius: 8,
                display: "flex",
                gap: 6,
                alignItems: "center",
              })}
            >
              <span style={{ fontSize: 12 }}>{item.icon}</span> {item.label} {item.desc && <span style={{ fontSize: 11, background: "#e2e8f0", padding: "1px 6px", borderRadius: 10 }}>{item.desc}</span>}
            </NavLink>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
function Layout({ children }: { children: React.ReactNode }) {
  return <LangProvider><LayoutInner>{children}</LayoutInner></LangProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/models" element={<Models />} />
          <Route path="/keys" element={<Keys />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </React.StrictMode>
);
