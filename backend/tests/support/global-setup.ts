import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { TEST_DATABASE_URL } from './test-env.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../prisma/migrations');

/**
 * Rebuilds the test database from the committed migrations before the integration suite.
 * Production deployments use `prisma migrate deploy`; this applies the same SQL files in the
 * same order so tests exercise the real schema, constraints and indexes.
 */
export default async function setup(): Promise<void> {
  const databaseName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  // Safety guard: this function drops the schema. It must never touch a real database.
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${databaseName}": test database names must end in _test`);
  }

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const folders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const folder of folders) {
      await client.query(readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}
