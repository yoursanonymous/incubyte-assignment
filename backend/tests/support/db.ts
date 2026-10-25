import { createDb, type Db } from '../../src/infrastructure/db.js';
import { loadEnv } from '../../src/config/env.js';

/** Creates a Prisma client for the (already guarded) test database. */
export function createTestDb(): Db {
  return createDb(loadEnv());
}

const TABLES = [
  'idempotency_keys',
  'purchases',
  'refresh_tokens',
  'audit_events',
  'vehicles',
  'users',
] as const;

/** Empties all tables. Only ever called against the `_test` database (see global-setup guard). */
export async function resetDb(db: Db): Promise<void> {
  const name = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refusing to truncate "${name}"`);
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
