import fs from "node:fs";
import path from "node:path";
import { providers } from "../providers/registry.js";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { resolveDataPath } from "../lib/paths.js";

function hasRealKey(providerId: string): boolean {
  const keys = config.providerKeys[providerId] || [];
  return keys.some((k) => k.length > 20 && !k.includes("xxx") && !k.includes("change-me"));
}

function isPublic(providerId: string): boolean {
  return ["pollinations", "llm7-io", "hugging-face", "huggingface", "ollama-cloud", "glhf-chat", "glhf"].includes(providerId);
}

export async function syncLiveModels(): Promise<{ total: number; providers: number; liveModels: any[] }> {
  const liveModels: any[] = [];
  let providersSynced = 0;
  for (const [providerId, provider] of Object.entries(providers)) {
    const hasKey = hasRealKey(providerId);
    if (!hasKey && !isPublic(providerId)) continue;
    const key = (config.providerKeys[providerId] || [])[0] || "";
    try {
      const models = await provider.models(key);
      for (const m of models) {
        liveModels.push({
          id: m.id,
          provider: providerId,
          display_name: m.displayName || m.id.split("/").pop(),
          context_length: m.contextLength || 8192,
          owned_by: providerId,
        });
      }
      providersSynced++;
      logger.info({ provider: providerId, count: models.length }, "live sync ok");
    } catch (e: any) {
      logger.warn({ provider: providerId, err: e.message }, "live sync failed");
    }
  }
  const out = resolveDataPath("live-models.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), total: liveModels.length, providers: providersSynced, models: liveModels }, null, 2));
  return { total: liveModels.length, providers: providersSynced, liveModels };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncLiveModels().then((r) => {
    console.log(`✅ Live sync: ${r.total} models from ${r.providers} providers`);
  });
}
