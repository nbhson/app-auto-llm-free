import { verifyFreeModels, saveVerifyReport } from "./verify-free.js";
import { syncLiveModels } from "./sync-live-models.js";
import { logger } from "../middleware/logger.js";
import { config } from "../config.js";
import fs from "node:fs";
import { resolveDataPath } from "../lib/paths.js";
import { errMessage } from "../lib/types.js";
import { runBootSync } from "./boot-sync.js";

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
      } catch (e) {
        logger.warn({ err: errMessage(e) }, "scheduler: cost-router syncPricing failed");
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
  // Boot-sync: always check for new providers added via .env and auto-sync live models
  // This ensures sau khi update .env và restart gateway thì Providers/Models/Usage tự động cập nhật
  setTimeout(async () => {
    try {
      const res = await runBootSync();
      if (res.synced) {
        logger.info({ total: res.total, providers: res.providers, newlyAdded: res.newlyAdded }, "scheduler: boot-sync live done");
      } else if (res.newlyAdded.length === 0 && isStale()) {
        // fallback: stale verify path when no new provider but data old
        logger.info({ interval: INTERVAL_MS }, "scheduler: verified-models.json stale, running verify (boot-sync skipped, no new provider)");
        const report = await verifyFreeModels({ dryRun: false });
        await saveVerifyReport(report);
        try { await syncLiveModels(); } catch { /* ignore */ }
        logger.info("scheduler: initial verify done (stale fallback)");
      } else {
        logger.info({ reason: res.reason }, "scheduler: boot-sync skipped");
        if (isStale()) {
          logger.info("scheduler: verified-models.json stale but boot-sync says no change — running verify anyway");
          const report = await verifyFreeModels({ dryRun: false });
          await saveVerifyReport(report);
          logger.info("scheduler: stale verify done");
        } else {
          logger.info("scheduler: verified-models.json fresh, skipping verify");
        }
      }
    } catch (e) {
      logger.error({ err: errMessage(e) }, "scheduler: boot-sync failed");
      // fallback to old behavior
      if (isStale()) {
        try {
          const report = await verifyFreeModels({ dryRun: false });
          await saveVerifyReport(report);
          try { await syncLiveModels(); } catch { /* ignore */ }
        } catch (ee) { logger.error({ err: errMessage(ee) }, "scheduler: fallback verify failed"); }
      }
    }
  }, 3000);

  // Then every 24h
  setInterval(async () => {
    logger.info("scheduler: 24h verify tick");
    try {
      const report = await verifyFreeModels({ dryRun: false });
      await saveVerifyReport(report);
      try { await syncLiveModels(); } catch { /* ignore */ }
      logger.info({ verified: report.total_verified_free, deprecated: report.total_deprecated }, "scheduler: periodic verify done");
    } catch (e) {
      logger.error({ err: errMessage(e) }, "scheduler: periodic verify failed");
    }
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS, hours: INTERVAL_MS / 3600000 }, "scheduler started: verify every 24h");
}
