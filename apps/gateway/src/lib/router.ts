import { config } from "../config.js";
import { providers, resolveProvidersForModel } from "../providers/registry.js";

type Strategy = "round-robin" | "tiered";

let rrIndex = 0;

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
  return ordered;
}

const ALLOW_NO_KEY = new Set(["pollinations", "llm7-io", "hugging-face", "huggingface", "ollama-cloud", "glhf-chat", "glhf"]);

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

export function isPublicProvider(providerId: string): boolean {
  return ALLOW_NO_KEY.has(providerId);
}
