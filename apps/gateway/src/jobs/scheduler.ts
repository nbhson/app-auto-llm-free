import { verifyFreeModels, saveVerifyReport } from "./verify-free.js";
import { syncLiveModels } from "./sync-live-models.js";
import { logger } from "../middleware/logger.js";
import { config } from "../config.js";
import fs from "node:fs";
import { resolveDataPath } from "../lib/paths.js";

const INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || "86400000", 10); // 24h
const VERIFIED_PATH = resolveDataPath("verified-models.json");

function isStale(): boolean {
  try {
    if (!fs.existsSync(VERIFIED_PATH)) return true;
    const stat = fs.statSync(VERIFIED_PATH);
    const age = Date.now() - stat.mtimeMs;
    return age > INTERVAL_MS;
  } catch {
    return true;
  }
}

export function startScheduler() {
  // Cost routing pricing sync (if enabled) - run once at startup
  if (config.costRoutingEnabled) {
    setTimeout(async () => {
      try {
        const { syncPricing } = await import("../lib/cost-router.js");
        await syncPricing();
      } catch (e: any) {
        logger.warn({ err: e.message }, "scheduler: cost-router syncPricing failed");
      }
    }, 8000);
    // then every 6h
    setInterval(async () => {
      try {
        const { syncPricing } = await import("../lib/cost-router.js");
        await syncPricing();
      } catch { /* ignore */ }
    }, 6 * 60 * 60 * 1000);
  }
  // Run once at startup if stale
  if (isStale()) {
    logger.info({ interval: INTERVAL_MS }, "scheduler: verified-models.json stale, running verify in 5s");
    setTimeout(async () => {
      try {
        const report = await verifyFreeModels({ dryRun: false });
        await saveVerifyReport(report);
        try { await syncLiveModels(); } catch { /* ignore */ }
        logger.info("scheduler: initial verify done");
      } catch (e: any) {
        logger.error({ err: e.message }, "scheduler: initial verify failed");
      }
    }, 5000);
  } else {
    logger.info("scheduler: verified-models.json fresh, skipping initial verify");
  }

  // Then every 24h
  setInterval(async () => {
    logger.info("scheduler: 24h verify tick");
    try {
      const report = await verifyFreeModels({ dryRun: false });
      await saveVerifyReport(report);
      try { await syncLiveModels(); } catch { /* ignore */ }
      logger.info({ verified: report.total_verified_free, deprecated: report.total_deprecated }, "scheduler: periodic verify done");
    } catch (e: any) {
      logger.error({ err: e.message }, "scheduler: periodic verify failed");
    }
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS, hours: INTERVAL_MS / 3600000 }, "scheduler started: verify every 24h");
}
