import fs from "node:fs";
import path from "node:path";
import { providers } from "../providers/registry.js";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";

export type VerifyStatus = "verified_free" | "verified_paid" | "deprecated" | "unverified_no_key" | "error" | "unverified_no_data";

export interface VerifiedModel {
  id: string; // e.g. nvidia-nim/z-ai/glm-5.2
  provider: string;
  freellms_free: boolean;
  freellms_score?: number;
  live_free?: boolean;
  live_found?: boolean;
  status: VerifyStatus;
  last_verified: string;
  latency_ms?: number;
  error?: string;
  context_length?: number;
}

export interface VerifyReport {
  generated_at: string;
  total_freellms_free: number;
  total_verified_free: number;
  total_deprecated: number;
  total_unverified_no_key: number;
  total_error: number;
  providers: Array<{
    id: string;
    freellms_free: number;
    live_models: number;
    verified_free: number;
    deprecated: number;
    unverified_no_key: boolean;
    error?: string;
    latency_ms?: number;
  }>;
  models: VerifiedModel[];
}

function loadFreellmsFree(): any[] {
  const p = path.resolve("data/freellms-models-free.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function loadFreellmsProviders(): any[] {
  const p = path.resolve("data/freellms-providers.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/**
 * Live probe: for each provider, try to fetch /models with available key.
 * If no key, mark all its freellms models as unverified_no_key.
 * If key exists, compare live list vs freellms free list.
 */
export async function verifyFreeModels(opts?: { dryRun?: boolean; concurrency?: number }): Promise<VerifyReport> {
  const freellmsFree = loadFreellmsFree();
  const freellmsProviders = loadFreellmsProviders();
  const byProvider = new Map<string, any[]>();
  for (const m of freellmsFree) {
    const slug = m.slug;
    if (!byProvider.has(slug)) byProvider.set(slug, []);
    byProvider.get(slug)!.push(m);
  }

  const report: VerifyReport = {
    generated_at: new Date().toISOString(),
    total_freellms_free: freellmsFree.length,
    total_verified_free: 0,
    total_deprecated: 0,
    total_unverified_no_key: 0,
    total_error: 0,
    providers: [],
    models: [],
  };

  const dryRun = opts?.dryRun ?? false;

  for (const [providerId, provider] of Object.entries(providers)) {
    const freellmsCount = byProvider.get(providerId)?.length || 0;
    const freellmsCountAlias = freellmsFree.filter((m: any) => m.provider === providerId || m.slug === providerId).length;
    // Use actual freellms count for this provider (could be 0 for legacy like "nvidia")
    const effectiveFreellmsCount = freellmsCount || freellmsCountAlias;

    // Skip providers with 0 freellms free unless they are core (e.g., pollinations)
    if (effectiveFreellmsCount === 0 && !["pollinations", "together", "fireworks", "novita"].includes(providerId)) {
      // still report but no models to verify
      continue;
    }

    const keys = config.providerKeys[providerId] || [];
    const hasKey = keys.length > 0;
    // Special: pollinations/llm7 allow no key
    const allowNoKey = ["pollinations", "llm7-io", "hugging-face"].includes(providerId);

    if (!dryRun && !hasKey && !allowNoKey) {
      // Mark all freellms models for this provider as unverified_no_key (live needs key)
      // In dryRun mode we simulate verification even without key for CI
      const list = byProvider.get(providerId) || freellmsFree.filter((m: any) => m.slug === providerId);
      for (const m of list) {
        const id = `${m.slug}/${m.name}`;
        report.models.push({
          id,
          provider: providerId,
          freellms_free: true,
          freellms_score: parseInt(m.score) || 0,
          status: "unverified_no_key",
          last_verified: report.generated_at,
          context_length: parseInt(m.context) || 8192,
          error: "no API key configured — set " + providerId.toUpperCase().replace(/-/g, "_") + "_API_KEYS in .env to verify",
        });
      }
      report.providers.push({
        id: providerId,
        freellms_free: list.length,
        live_models: 0,
        verified_free: 0,
        deprecated: 0,
        unverified_no_key: true,
      });
      report.total_unverified_no_key += list.length;
      continue;
    }

    const key = keys[0] || "";
    const start = Date.now();
    let liveModels: any[] = [];
    let error: string | undefined;
    try {
      if (dryRun) {
        // Dry run: simulate without hitting upstream (use freellms count as live)
        // For CI, we just mark as verified_free if freellms says free
        liveModels = (byProvider.get(providerId) || []).map((m: any) => ({ id: `${providerId}/${m.name}`, provider: providerId }));
      } else {
        liveModels = await provider.models(key);
      }
    } catch (e: any) {
      error = e.message || String(e);
      logger.warn({ provider: providerId, err: error }, "verify: models() failed");
    }
    const latency = Date.now() - start;
    const liveSet = new Set(liveModels.map((m) => m.id.toLowerCase()));
    const liveSetShort = new Set(liveModels.map((m) => (m.id.split("/").pop() || "").toLowerCase()));

    if (error) {
      const list = byProvider.get(providerId) || [];
      for (const m of list) {
        report.models.push({
          id: `${m.slug}/${m.name}`,
          provider: providerId,
          freellms_free: true,
          freellms_score: parseInt(m.score) || 0,
          status: "error",
          last_verified: report.generated_at,
          error,
          latency_ms: latency,
        });
      }
      report.providers.push({
        id: providerId,
        freellms_free: list.length,
        live_models: liveModels.length,
        verified_free: 0,
        deprecated: 0,
        unverified_no_key: false,
        error,
        latency_ms: latency,
      });
      report.total_error += list.length;
      continue;
    }

    // Compare
    const list = byProvider.get(providerId) || freellmsFree.filter((m: any) => m.slug === providerId);
    let verified = 0;
    let deprecated = 0;
    for (const m of list) {
      const full = `${m.slug}/${m.name}`.toLowerCase();
      const short = (m.name || "").toLowerCase();
      const found = liveSet.has(full) || liveSetShort.has(short) || liveModels.some((lm) => lm.id.toLowerCase().includes(short) || short.includes(lm.id.toLowerCase().split("/").pop() || ""));
      const status: VerifyStatus = found ? "verified_free" : "deprecated";
      if (found) verified++;
      else deprecated++;
      report.models.push({
        id: `${m.slug}/${m.name}`,
        provider: providerId,
        freellms_free: true,
        freellms_score: parseInt(m.score) || 0,
        live_free: found ? true : false,
        live_found: found,
        status,
        last_verified: report.generated_at,
        latency_ms: latency,
        context_length: parseInt(m.context) || 8192,
        error: found ? undefined : `not found in live /models (provider returned ${liveModels.length} models) — may be deprecated or renamed`,
      });
    }

    report.providers.push({
      id: providerId,
      freellms_free: list.length,
      live_models: liveModels.length,
      verified_free: verified,
      deprecated,
      unverified_no_key: false,
      latency_ms: latency,
    });
    report.total_verified_free += verified;
    report.total_deprecated += deprecated;

    // Also detect new free models that are in live but not in freellms free list
    // (optional, for report)
  }

  // Also handle freellms providers that are not in our registry (e.g., nscale, nebius with 0 models) — ignore

  return report;
}

export async function saveVerifyReport(report: VerifyReport) {
  const out = path.resolve("data/verified-models.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  // Also write summary for gateway to use quickly
  const summary = {
    generated_at: report.generated_at,
    total_freellms_free: report.total_freellms_free,
    total_verified_free: report.total_verified_free,
    total_deprecated: report.total_deprecated,
    total_unverified_no_key: report.total_unverified_no_key,
    providers: report.providers,
  };
  fs.writeFileSync(path.resolve("data/verified-summary.json"), JSON.stringify(summary, null, 2));
  logger.info({ verified: report.total_verified_free, deprecated: report.total_deprecated, unverified: report.total_unverified_no_key }, "verify report saved");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dry = process.argv.includes("--dry-run");
  verifyFreeModels({ dryRun: dry }).then(async (r) => {
    await saveVerifyReport(r);
    console.log(`✅ Verified ${r.total_verified_free}/${r.total_freellms_free} free (deprecated ${r.total_deprecated}, unverified_no_key ${r.total_unverified_no_key})`);
    for (const p of r.providers) {
      console.log(`${p.id.padEnd(28)} free:${p.freellms_free.toString().padStart(3)} live:${p.live_models.toString().padStart(3)} verified:${p.verified_free.toString().padStart(3)} deprecated:${p.deprecated.toString().padStart(3)} ${p.unverified_no_key ? "(no key)" : ""} ${p.error || ""}`);
    }
  });
}
