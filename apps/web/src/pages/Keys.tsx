import { useEffect, useState } from "react";
import { Copy, Check, Key, Trash2, ShieldCheck, Dices, Terminal, ShieldAlert } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }
function randHex(bytes: number) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(""); }

export default function Keys() {
  const { t } = useLang();
  const [keys, setKeys] = useState<any[]>([]);
  const [name, setName] = useState("my-app");
  const [scopes, setScopes] = useState('{"models":["*"],"providers":["*"]}');
  const [rpm, setRpm] = useState("60");
  const [lastCreated, setLastCreated] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => { fetch("/api/keys", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => setKeys(d.data || [])).catch(() => {}); };
  useEffect(() => { load(); }, []);
  const create = async () => {
    let sc: any; try { sc = JSON.parse(scopes); } catch { alert("scopes JSON invalid"); return; }
    const res = await fetch("/api/keys", { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes: sc, rpmLimit: parseInt(rpm, 10) }) });
    const data = await res.json(); if (!res.ok) alert(JSON.stringify(data)); else { setLastCreated(data); load(); }
  };
  const del = async (id: string) => { if (!confirm(`Delete ${id}?`)) return; await fetch(`/api/keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${mk()}` } }); load(); };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("keys.title")} <span className="text-sm font-mono bg-slate-900 text-white px-2.5 py-0.5 rounded-full">{keys.length}</span></h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage proxy credentials and test them instantly.</p>
      </div>

      {lastCreated && (
        <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-xl shadow-md flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm"><ShieldAlert className="w-4 h-4 text-amber-600" /> Save your new API Secret (Shown only once)</div>
            <button onClick={() => setLastCreated(null)} className="text-xs underline text-amber-700">Dismiss</button>
          </div>
          <div className="flex items-center gap-2 bg-white/90 p-2.5 rounded-lg border border-amber-200">
            <code className="flex-1 font-mono text-xs truncate select-all">{lastCreated.key}</code>
            <button onClick={() => { navigator.clipboard.writeText(lastCreated.key); setCopied("new"); setTimeout(()=>setCopied(null),1500); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-600 text-white">{copied==="new" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied==="new" ? "Copied" : "Copy Key"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600"><Key className="w-4 h-4" /></div><div><h2 className="text-sm font-bold text-slate-900">Key Generator — MASTER_KEY & ENCRYPTION_KEY (optional)</h2><p className="text-xs text-slate-500">Auto-generated on first boot — use here only to rotate.</p></div></div>
        </div>
        <KeyGen />
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600"><Key className="w-4 h-4" /></div><h2 className="text-sm font-bold text-slate-900">{t("keys.create_title")}</h2></div>
        <div className="flex flex-wrap gap-3 items-end bg-slate-50/50 p-3 rounded-lg border border-slate-100">
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono w-36 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></label>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">RPM <input value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder="60" className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono w-24 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider flex-1 min-w-[280px]">Scopes <input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder='{"models":["*"],"providers":["*"]}' className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
          <button onClick={create} className="h-[38px] px-5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-xs active:scale-[0.98] transition-transform">Create</button>
        </div>
        <p className="text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">{t("keys.create_scopes_hint")}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
              <tr><th className="px-4 py-3">{t("keys.th_id")}</th><th className="px-4 py-3">{t("keys.th_name")}</th><th className="px-4 py-3">{t("keys.th_role")}</th><th className="px-4 py-3">{t("keys.th_scopes")}</th><th className="px-4 py-3">{t("keys.th_rpm")}</th><th className="px-4 py-3">{t("keys.th_requests")}</th><th className="px-4 py-3">{t("keys.th_created")}</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3"><code className="text-xs font-mono bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">{k.id}</code></td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{k.name}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${k.role === "admin" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>{k.role}</span></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600 max-w-xs truncate">{JSON.stringify(k.scopes)}</td>
                  <td className="px-4 py-3 font-mono font-bold">{k.rpmLimit}</td>
                  <td className="px-4 py-3 font-mono">{k.requestCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{k.id !== "vk-master" && <button onClick={() => del(k.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-md border border-transparent hover:border-rose-200"><Trash2 className="w-3.5 h-3.5" />Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {keys.length === 0 && <div className="p-8 text-center text-sm text-slate-400">{t("keys.no_keys")}</div>}
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex items-center gap-2"><div className="p-1.5 bg-slate-900 text-white rounded-md"><Terminal className="w-4 h-4" /></div><h2 className="text-sm font-bold text-slate-900">{t("keys.quick_test")}</h2></div>
        <p className="text-xs text-slate-500">{t("keys.quick_test_desc")} <code className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-xs">$FGK_KEY</code></p>
        <div className="relative rounded-xl bg-slate-950 p-4 border border-slate-900 font-mono text-xs shadow-2xs">
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /><span className="text-slate-500 text-[11px] ml-2">Auto router</span></div><button onClick={() => navigator.clipboard.writeText(`curl http://localhost:8080/v1/chat/completions -H "Authorization: Bearer $FGK_KEY" -H "Content-Type: application/json" -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`)} className="text-[11px] font-semibold text-slate-300 hover:text-white">Copy</button></div>
          <pre className="text-emerald-400 whitespace-pre-wrap break-all">{`curl http://localhost:8080/v1/chat/completions \\\n  -H "Authorization: Bearer $FGK_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        </div>
        <div className="relative rounded-xl bg-slate-950 p-4 border border-slate-900 font-mono text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /><span className="text-slate-400 text-[11px] ml-2">Pin provider: pollinations</span></div>
          <pre className="text-sky-300 whitespace-pre-wrap break-all">{`curl http://localhost:8080/v1/chat/completions \\\n  -H "Authorization: Bearer $FGK_KEY" -H "x-router: pollinations" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}]}'`}</pre>
        </div>
      </div>
    </div>
  );
}

function KeyGen() {
  const { t } = useLang();
  const [master, setMaster] = useState("");
  const [enc, setEnc] = useState("");
  const gen = () => { setMaster(`fgk-master-${randHex(16)}`); setEnc(randHex(32)); };
  useEffect(() => { gen(); }, []);
  const useMaster = () => { localStorage.setItem("masterKey", master); alert(t("keys.saved_alert")); location.reload(); };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><button onClick={gen} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-200 hover:bg-slate-200"><Dices className="w-3.5 h-3.5" />{t("keys.gen_new")}</button><span className="text-[11px] text-slate-400">{t("keys.gen_hint")}</span></div>
      <div className="grid gap-3">
        <label className="text-xs font-semibold text-slate-600">MASTER_KEY <div className="flex gap-2 mt-1"><code className="flex-1 font-mono text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg break-all">{master}</code><button onClick={() => navigator.clipboard.writeText(master)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50">Copy</button><button onClick={useMaster} className="px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />{t("keys.use_in_ui")}</button></div></label>
        <label className="text-xs font-semibold text-slate-600">ENCRYPTION_KEY (64 hex) <div className="flex gap-2 mt-1"><code className="flex-1 font-mono text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg break-all">{enc}</code><button onClick={() => navigator.clipboard.writeText(enc)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50">Copy</button></div></label>
      </div>
      <div className="relative rounded-xl bg-slate-950 p-4 border border-slate-900 font-mono text-xs">
        <div className="flex items-center gap-1.5 mb-2"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /><span className="text-slate-400 text-[11px] ml-2"># Paste into .env</span></div>
        <pre className="text-emerald-400 whitespace-pre-wrap break-all">{`MASTER_KEY=${master}\nENCRYPTION_KEY=${enc}`}</pre>
      </div>
    </div>
  );
}
