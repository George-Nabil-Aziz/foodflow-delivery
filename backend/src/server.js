import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './shared/logger.js';
import { checkDatabase, closeDatabase } from './shared/db/knex.js';
import { startJobs, stopJobs } from './jobs/index.js';

/**
 * Process entry point. Verifies the database before listening: failing at
 * startup is far better than serving 500s and discovering the problem at the
 * first request.
 */
async function main() {
  const dbUp = await checkDatabase();
  if (!dbUp) {
    logger.error('Cannot reach the database. Check DATABASE_URL and that PostgreSQL is running.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'FoodFlow API listening');
  });

  startJobs();

  /** Graceful drain: stop accepting, finish in-flight work, close the pool. */
  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    stopJobs();
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    // Do not hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
  process.exit(1);
});

main().catch((err) => {
  // A configuration error throws before anything listens; report it plainly.
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
