import fs from "node:fs";
import path from "node:path";
import { providers, providerMeta } from "../providers/registry.js";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { readDataJson, resolveDataPath } from "../lib/paths.js";

function hasRealKey(providerId: string): boolean {
  const keys = config.providerKeys[providerId] || [];
  return keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me"));
}

function isPublic(providerId: string): boolean {
  return ["pollinations", "llm7-io", "hugging-face", "huggingface", "ollama-cloud", "glhf-chat", "glhf"].includes(providerId);
}

export async function syncLiveModels(opts?: { freeOnly?: boolean }): Promise<{ total: number; providers: number; liveModels: any[]; totalFetched?: number; filtered?: number }> {
  const freeOnly = opts?.freeOnly ?? true; // default only free
  // Load freellms free set for filtering (if available)
  const freellmsFree = readDataJson<any[]>("freellms-models-free.json", []);
  const freellmsSet = new Set(freellmsFree.map((m: any) => `${m.slug}/${m.name}`.toLowerCase()));
  const freellmsShort = new Set(freellmsFree.map((m: any) => (m.name || "").toLowerCase()));
  const liveModels: any[] = [];
  let providersSynced = 0;
  let totalFetched = 0;
  for (const [providerId, provider] of Object.entries(providers)) {
    const hasKey = hasRealKey(providerId);
    if (!hasKey && !isPublic(providerId)) continue;
    const key = (config.providerKeys[providerId] || [])[0] || "";
    try {
      const models = await provider.models(key);
      totalFetched += models.length;
      let filtered = models;
      if (freeOnly) {
        const meta = (providerMeta as any)[providerId];
        const isPermanent = meta?.tier_type === "permanent";
        filtered = models.filter((m: any) => {
          const idLower = m.id.toLowerCase();
          const short = (m.id.split("/").pop() || "").toLowerCase();
          // :free suffix is explicit free
          if (idLower.includes(":free") || idLower.includes("(free)")) return true;
          // Permanent Free providers: all live are free
          if (isPermanent) return true;
          // Quota providers: only if in freellms free list
          if (freellmsSet.has(idLower) || freellmsShort.has(short)) return true;
          // Also check freellms full id without sanitization (original name may have spaces)
          // Fallback: if model id contains freellms short substring
          return freellmsFree.some((f: any) => idLower.includes((f.name || "").toLowerCase().split(" ")[0]) && f.slug === providerId);
        });
        // If filtering removed all but provider is quota with known free count, keep at least freellms count
        if (filtered.length === 0 && models.length > 0) {
          // For quota providers where live filter too strict, fallback to show freellms free if any
          const freCount = freellmsFree.filter((f: any) => f.slug === providerId).length;
          if (freCount > 0) filtered = models.filter((m: any) => freCount > 0 && (m.id.toLowerCase().includes(":free") || freellmsSet.has(m.id.toLowerCase())));
          if (filtered.length === 0) filtered = []; // keep empty if still none
        }
      }
      for (const m of filtered) {
        liveModels.push({
          id: m.id,
          provider: providerId,
          display_name: m.displayName || m.id.split("/").pop(),
          context_length: m.contextLength || 8192,
          owned_by: providerId,
        });
      }
      providersSynced++;
      logger.info({ provider: providerId, count: models.length, filtered: filtered.length, freeOnly }, "live sync ok");
    } catch (e: any) {
      logger.warn({ provider: providerId, err: e.message }, "live sync failed");
    }
  }
  const out = resolveDataPath("live-models.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), total: liveModels.length, providers: providersSynced, total_fetched: totalFetched, free_only: freeOnly, models: liveModels }, null, 2));
  return { total: liveModels.length, providers: providersSynced, totalFetched, liveModels };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncLiveModels().then((r) => {
    console.log(`✅ Live sync: ${r.total} models from ${r.providers} providers`);
  });
}
