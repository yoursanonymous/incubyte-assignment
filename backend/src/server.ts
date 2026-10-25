import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { createDb } from './infrastructure/db.js';
import { createLogger } from './infrastructure/logger.js';

function readEnv() {
  try {
    return loadEnv();
  } catch (error) {
    // Fail fast with a readable message (variable names only, never values) before anything listens.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
const env = readEnv();
const logger = createLogger(env.LOG_LEVEL);
const db = createDb(env);
const server = createApp({ env, db }).listen(env.PORT, () =>
  logger.info({ port: env.PORT }, 'API listening'),
);

// Defence against slow-client resource exhaustion.
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 65_000; // longer than typical load-balancer idle timeouts

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection');
  process.exit(1);
});
