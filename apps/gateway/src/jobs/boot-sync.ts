import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { hasRealKey } from "../lib/provider-keys.js";
import { providerIds } from "../providers/registry.js";
import { logger } from "../middleware/logger.js";
import { readDataJson, resolveDataPath } from "../lib/paths.js";
import { errMessage } from "../lib/types.js";
import { _resetModelStoreCache } from "../lib/model-store.js";

export interface ProviderFingerprintState {
  updated_at: string;
  providers: Record<string, { hasKey: boolean; keyCount: number; addedAt?: string }>;
  lastAdded?: string[]; // providers newly added in last boot
  lastAddedAt?: string;
  bootSync?: { at: string; status: "running" | "done" | "failed"; total?: number; providers?: number; error?: string };
  liveSync?: { generated_at: string | null; total: number; providers: number };
}

const FINGERPRINT_FILE = ".provider-fingerprint.json";
const LIVE_MODELS_FILE = "live-models.json";

function nowIso() { return new Date().toISOString(); }

function getCurrentFingerprint(): Record<string, { hasKey: boolean; keyCount: number }> {
  const map: Record<string, { hasKey: boolean; keyCount: number }> = {};
  for (const id of providerIds) {
    const keys = config.providerKeys[id] || [];
    const count = keys.length;
    const real = hasRealKey(id);
    map[id] = { hasKey: real, keyCount: count };
  }
  return map;
}

function readFingerprint(): ProviderFingerprintState | null {
  return readDataJson<ProviderFingerprintState | null>(FINGERPRINT_FILE, null);
}

function writeFingerprint(state: ProviderFingerprintState) {
  const p = resolveDataPath(FINGERPRINT_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

function detectNewProviders(prev: ProviderFingerprintState | null, cur: Record<string, { hasKey: boolean; keyCount: number }>): string[] {
  if (!prev) {
    // first run: treat any hasKey=true as newly added
    return Object.entries(cur).filter(([, v]) => v.hasKey).map(([k]) => k);
  }
  const added: string[] = [];
  for (const [id, v] of Object.entries(cur)) {
    const before = prev.providers[id];
    if (v.hasKey && (!before || !before.hasKey)) added.push(id);
  }
  return added;
}

function needsLiveSync(prev: ProviderFingerprintState | null, cur: Record<string, { hasKey: boolean; keyCount: number }>, newlyAdded: string[]): boolean {
  // Always sync if newly added providers exist
  if (newlyAdded.length > 0) return true;
  // Or if live-models.json missing/empty while we have keys
  const live = readDataJson<{ total?: number; generated_at?: string | null } | null>(LIVE_MODELS_FILE, null);
  const hasAnyKey = Object.values(cur).some((v) => v.hasKey);
  if (hasAnyKey && (!live || !live.total || live.total === 0)) return true;
  // Or if live file stale vs key count change (keyCount increased)
  if (prev) {
    for (const [id, v] of Object.entries(cur)) {
      const before = prev.providers[id];
      if (before && v.keyCount > before.keyCount) return true;
    }
  }
  return false;
}

export async function runBootSync(opts?: { force?: boolean; reason?: string }): Promise<{ synced: boolean; total?: number; providers?: number; newlyAdded: string[]; reason: string }> {
  const cur = getCurrentFingerprint();
  const prev = readFingerprint();
  const newlyAdded = detectNewProviders(prev, cur);

  // Build new state base (preserve addedAt for existing)
  const mergedProviders: ProviderFingerprintState["providers"] = {};
  const ts = nowIso();
  for (const [id, v] of Object.entries(cur)) {
    const before = prev?.providers[id];
    let addedAt = before?.addedAt;
    if (v.hasKey && !addedAt) addedAt = ts;
    if (!v.hasKey) addedAt = undefined;
    // if newly added, force new timestamp
    if (newlyAdded.includes(id)) addedAt = ts;
    mergedProviders[id] = { hasKey: v.hasKey, keyCount: v.keyCount, addedAt };
  }

  const state: ProviderFingerprintState = {
    updated_at: ts,
    providers: mergedProviders,
    lastAdded: newlyAdded.length > 0 ? newlyAdded : prev?.lastAdded,
    lastAddedAt: newlyAdded.length > 0 ? ts : prev?.lastAddedAt,
    bootSync: prev?.bootSync,
    liveSync: prev?.liveSync,
  };

  // Determine if we should sync
  const shouldSync = opts?.force || needsLiveSync(prev, cur, newlyAdded);
  const reason = opts?.reason || (newlyAdded.length > 0 ? `new_providers:${newlyAdded.join(",")}` : shouldSync ? "missing_live_models" : "no_change");

  // Persist fingerprint immediately (so topology can read newest provider even before sync finishes)
  if (newlyAdded.length > 0 || JSON.stringify(prev?.providers) !== JSON.stringify(mergedProviders)) {
    writeFingerprint(state);
  } else if (!prev) {
    writeFingerprint(state);
  }

  if (!shouldSync) {
    // Fix stuck "running" from previous killed boot (e.g. SIGTERM during live sync)
    if (prev?.bootSync?.status === "running") {
      const fixed: ProviderFingerprintState = { ...state, bootSync: { at: prev.bootSync.at, status: "done", total: prev.liveSync?.total, providers: prev.liveSync?.providers } };
      try { writeFingerprint(fixed); } catch { /* ignore */ }
    } else if (newlyAdded.length === 0 && JSON.stringify(prev?.providers) !== JSON.stringify(mergedProviders)) {
      // still persist mergedProviders if keyCount changed but no sync needed
      try { writeFingerprint(state); } catch { /* ignore */ }
    }
    logger.info({ newlyAdded, reason }, "boot-sync: skip (no new provider, live models fresh)");
    return { synced: false, newlyAdded, reason };
  }

  // Mark bootSync running
  const runningState: ProviderFingerprintState = { ...state, bootSync: { at: ts, status: "running" } };
  writeFingerprint(runningState);
  logger.info({ newlyAdded, reason }, "boot-sync: starting live sync for new providers");

  try {
    const { syncLiveModels } = await import("./sync-live-models.js");
    const liveResult = await syncLiveModels({ freeOnly: false });
    // after live sync, also refresh verified if we have freellms data and keys
    try {
      const { verifyFreeModels, saveVerifyReport } = await import("./verify-free.js");
      const report = await verifyFreeModels({ dryRun: false });
      await saveVerifyReport(report);
      logger.info({ verified: report.total_verified_free, deprecated: report.total_deprecated }, "boot-sync: verify done");
    } catch (e) {
      logger.warn({ err: errMessage(e) }, "boot-sync: verify failed (non-fatal)");
    }
    _resetModelStoreCache();
    const doneState: ProviderFingerprintState = {
      ...runningState,
      updated_at: nowIso(),
      bootSync: { at: ts, status: "done", total: liveResult.total, providers: liveResult.providers },
      liveSync: { generated_at: nowIso(), total: liveResult.total, providers: liveResult.providers },
    };
    writeFingerprint(doneState);
    logger.info({ total: liveResult.total, providers: liveResult.providers, newlyAdded }, "boot-sync: done");
    return { synced: true, total: liveResult.total, providers: liveResult.providers, newlyAdded, reason };
  } catch (e) {
    const msg = errMessage(e);
    const failedState: ProviderFingerprintState = {
      ...runningState,
      bootSync: { at: ts, status: "failed", error: msg },
    };
    writeFingerprint(failedState);
    logger.error({ err: msg, newlyAdded }, "boot-sync: failed");
    return { synced: false, newlyAdded, reason: `failed:${msg}` };
  }
}

export function getFingerprintState(): ProviderFingerprintState | null {
  return readFingerprint();
}

export function getNewestProviders(limit = 5): string[] {
  const s = readFingerprint();
  if (!s) {
    // fallback: sort by hasKey then alphabetical
    return providerIds.filter((id) => hasRealKey(id)).slice(0, limit);
  }
  const entries = Object.entries(s.providers)
    .filter(([, v]) => v.hasKey && v.addedAt)
    .sort((a, b) => new Date(b[1].addedAt!).getTime() - new Date(a[1].addedAt!).getTime())
    .map(([k]) => k);
  return entries.slice(0, limit);
}
