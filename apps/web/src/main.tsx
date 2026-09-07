import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { Zap, LayoutDashboard, Server, Cpu, Key, ScrollText, ShieldCheck, Copy, Eye, EyeOff, Check, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
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

function LayoutInner({ children }: { children: React.ReactNode }) {
  const [masterKey, setMasterKey] = React.useState(() => getMasterKey());
  const [health, setHealth] = React.useState<"ok" | "down" | "loading">("loading");
  const [showKey, setShowKey] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(false);
  const [langMenuOpen, setLangMenuOpen] = React.useState(false);
  const { lang, setLang, t } = useLang();

  React.useEffect(() => {
    const saved = localStorage.getItem("masterKey");
    if (saved && saved !== masterKey) setMasterKey(saved);
  }, []);
  React.useEffect(() => {
    if (masterKey) localStorage.setItem("masterKey", masterKey);
  }, [masterKey]);

  React.useEffect(() => {
    fetch("/v1/health").then((r) => (r.ok ? setHealth("ok") : setHealth("down"))).catch(() => setHealth("down"));
  }, []);

  const handleCopyMasterKey = () => {
    navigator.clipboard.writeText(masterKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: <LayoutDashboard className="w-4 h-4" />, end: true as const },
    { to: "/providers", label: t("nav.providers"), icon: <Server className="w-4 h-4" />, badge: "43" },
    { to: "/models", label: t("nav.models"), icon: <Cpu className="w-4 h-4" />, badge: "316" },
    { to: "/keys", label: t("nav.keys"), icon: <Key className="w-4 h-4" /> },
    { to: "/logs", label: t("nav.logs"), icon: <ScrollText className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60">
      <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-100/80">
            <div className="flex items-center gap-3">
              <NavLink to="/" className="group flex items-center gap-2.5 text-left focus:outline-none transition-transform active:scale-[0.98]">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white flex items-center justify-center shadow-xs ring-1 ring-black/5 group-hover:shadow-sm group-hover:scale-105 transition-all duration-200">
                  <Zap className="w-4 h-4 fill-white stroke-white" />
                </div>
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors">Free LLM Gateway</span>
                <span className="font-mono text-[10px] font-semibold text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200/60 hidden sm:inline-flex">v0.2.0</span>
              </NavLink>

              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs ${health === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" : health === "down" ? "bg-rose-50 text-rose-700 border-rose-200/80" : "bg-slate-100 text-slate-600 border-slate-200/80"}`}>
                <span className="relative flex h-2 w-2">
                  {health === "ok" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${health === "ok" ? "bg-emerald-500" : health === "down" ? "bg-rose-500" : "bg-slate-400"}`}></span>
                </span>
                <span className="tracking-wide">{health === "ok" ? t("header.online") : health === "down" ? t("header.offline") : t("header.loading")}</span>
              </div>

              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/80 shadow-2xs">
                <span className="font-semibold text-slate-800">30</span>
                <span>providers</span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-amber-700">316</span>
                <span>free</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 transition-colors shadow-2xs"
                >
                  <span>{lang === "en" ? "🇬🇧 EN" : "🇻🇳 VI"}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {langMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-32 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                    <button
                      type="button"
                      onClick={() => { setLang("en"); setLangMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span>🇬🇧 English</span>
                      {lang === "en" && <Check className="w-3.5 h-3.5 text-amber-600" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLang("vi"); setLangMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span>🇻🇳 Tiếng Việt</span>
                      {lang === "vi" && <Check className="w-3.5 h-3.5 text-amber-600" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50/90 border border-slate-200/90 rounded-lg px-2.5 py-1 shadow-2xs">
                <div className="flex items-center gap-1 text-slate-500 select-none" title="Auto-generated admin key (read-only)">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 hidden sm:inline">{t("header.master")}</span>
                </div>
                <code className="font-mono text-xs text-slate-700 bg-transparent max-w-[160px] sm:max-w-[220px] truncate select-all" title={masterKey}>
                  {showKey ? masterKey : `${masterKey.slice(0, 12)}${masterKey.length > 12 ? "••••" + masterKey.slice(-4) : ""}`}
                </code>
                <button type="button" onClick={() => setShowKey(!showKey)} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors" title={showKey ? "Hide" : "Show"}>
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button type="button" onClick={handleCopyMasterKey} className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors" title="Copy">
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between overflow-x-auto no-scrollbar pt-2">
            <nav className="flex items-center gap-1.5 sm:gap-2 pb-2 min-w-max" aria-label="Navigation Tabs">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${isActive ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? "text-amber-400" : "text-slate-500"}>{item.icon}</span>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-slate-800 text-slate-200 border border-slate-700" : "bg-slate-200/80 text-slate-700"}`}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <motion.div layoutId="activeTabBadge" className="absolute inset-0 rounded-lg -z-10 bg-slate-900" transition={{ type: "spring", stiffness: 450, damping: 35 }} />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-4 lg:px-6 pt-6 pb-12">{children}</main>
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
