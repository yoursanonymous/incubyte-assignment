import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';

export type Db = PrismaClient;

/**
 * Creates the application's Prisma client on top of a bounded `pg` pool.
 * Timeouts keep a slow database from holding request handlers forever.
 */
export function createDb(
  env: Pick<
    Env,
    'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_CONNECTION_TIMEOUT_MS' | 'DB_STATEMENT_TIMEOUT_MS'
  >,
): Db {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

/** The subset of the client available inside `$transaction(async (tx) => …)`. */
export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/** True when a Prisma/pg error is a unique-constraint violation (SQLSTATE 23505 / Prisma P2002). */
export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      cause?: unknown;
      meta?: { driverAdapterError?: unknown };
    };
    if (candidate.code === 'P2002' || candidate.code === '23505') return true;
    current = candidate.cause ?? candidate.meta?.driverAdapterError;
  }
  return false;
}
