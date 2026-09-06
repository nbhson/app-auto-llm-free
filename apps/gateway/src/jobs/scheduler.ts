import { verifyFreeModels, saveVerifyReport } from "./verify-free.js";
import { logger } from "../middleware/logger.js";
import fs from "node:fs";
import path from "node:path";

const INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || "86400000", 10); // 24h
const VERIFIED_PATH = path.resolve("data/verified-models.json");

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
  // Run once at startup if stale
  if (isStale()) {
    logger.info({ interval: INTERVAL_MS }, "scheduler: verified-models.json stale, running verify in 5s");
    setTimeout(async () => {
      try {
        const report = await verifyFreeModels({ dryRun: false });
        await saveVerifyReport(report);
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
      // Also refresh freellms data if needed (call python script if exists)
      // We don't auto-run python sync here to avoid extra deps; GitHub Action handles freellms sync.
      logger.info({ verified: report.total_verified_free, deprecated: report.total_deprecated }, "scheduler: periodic verify done");
    } catch (e: any) {
      logger.error({ err: e.message }, "scheduler: periodic verify failed");
    }
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS, hours: INTERVAL_MS / 3600000 }, "scheduler started: verify every 24h");
}
