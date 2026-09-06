import { config } from "../config.js";
import { providers, resolveProvidersForModel } from "../providers/registry.js";

type Strategy = "round-robin" | "tiered";

let rrIndex = 0;

const ALLOW_NO_KEY = new Set(["pollinations", "llm7-io", "hugging-face", "huggingface", "ollama-cloud", "glhf-chat", "glhf"]);

export function isPublicProvider(providerId: string): boolean {
  return ALLOW_NO_KEY.has(providerId);
}

export function getProvidersForRequest(model: string, strategy: Strategy = "tiered"): string[] {
  if (strategy === "round-robin") {
    const ids = resolveProvidersForModel(model);
    // rotate
    const rotated = [...ids.slice(rrIndex % ids.length), ...ids.slice(0, rrIndex % ids.length)];
    rrIndex++;
    return rotated.filter((id) => providers[id]);
  }

  // tiered: respect FALLBACK_TIERS, but filter by model alias if specified
  const preferred = resolveProvidersForModel(model);
  const tiers = config.fallbackTiers;
  const ordered: string[] = [];
  for (const tier of tiers) {
    for (const p of tier) {
      if (preferred.includes(p) && providers[p] && !ordered.includes(p)) ordered.push(p);
    }
  }
  // append remaining preferred not in tiers
  for (const p of preferred) {
    if (!ordered.includes(p) && providers[p]) ordered.push(p);
  }
  // Ưu tiên: key thật (real) -> public free (pollinations) -> dummy/no-key
  // Nếu chưa có key thật nào, pollinations sẽ lên đầu để auto không mock (10s -> 1s)
  function isRealKey(pid: string): boolean {
    const k = config.providerKeys[pid]?.[0] || "";
    return k.length > 20 && !k.includes("xxx") && !k.includes("change-me");
  }
  ordered.sort((a, b) => {
    const aReal = isRealKey(a);
    const bReal = isRealKey(b);
    if (aReal !== bReal) return aReal ? -1 : 1;
    const aPublic = isPublicProvider(a);
    const bPublic = isPublicProvider(b);
    if (aPublic !== bPublic) return aPublic ? -1 : 1; // public lên trước dummy
    const aHas = (config.providerKeys[a]?.length || 0) > 0 && !config.providerKeys[a]?.[0]?.includes("xxx");
    const bHas = (config.providerKeys[b]?.length || 0) > 0 && !config.providerKeys[b]?.[0]?.includes("xxx");
    if (aHas !== bHas) return aHas ? -1 : 1;
    return 0;
  });
  return ordered;
}

export function getNextKey(providerId: string): string | null {
  const keys = config.providerKeys[providerId] || [];
  if (keys.length === 0) {
    if (ALLOW_NO_KEY.has(providerId)) return "";
    return null;
  }
  const key = keys[rrIndex % keys.length];
  rrIndex++;
  return key;
}
