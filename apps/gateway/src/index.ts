import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./middleware/logger.js";
import { startScheduler } from "./jobs/scheduler.js";

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    logger.info(`🚀 Gateway listening on http://localhost:${info.port}`);
    logger.info(`   Health: http://localhost:${info.port}/v1/health`);
    logger.info(`   Models: http://localhost:${info.port}/v1/models`);
    logger.info(`   Chat:   POST http://localhost:${info.port}/v1/chat/completions`);
    console.log(`\nDocs: http://localhost:${info.port}/docs`);
    // Start 24h verify scheduler (checks freellms vs live /models)
    if (process.env.DISABLE_SCHEDULER !== "1") {
      startScheduler();
    }
  }
);
