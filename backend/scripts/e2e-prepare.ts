import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadEnv } from '../src/config/env.js';
import { createDb } from '../src/infrastructure/db.js';
import { provisionAdmin } from '../src/modules/auth/admin.provisioning.js';
import { createPasswordHasher } from '../src/modules/auth/password.js';

/** Resets the dedicated *_e2e database to a known state for browser tests. Refuses any other name. */
const env = loadEnv();
const name = new URL(env.DATABASE_URL).pathname.slice(1);
if (!name.endsWith('_e2e'))
  throw new Error(`Refusing to reset "${name}": e2e database names must end in _e2e`);

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
const dir = join(import.meta.dirname, '../prisma/migrations');
for (const folder of readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()) {
  await client.query(readFileSync(join(dir, folder, 'migration.sql'), 'utf8'));
}
await client.end();

const db = createDb(env);
const hasher = createPasswordHasher({
  memoryKiB: env.ARGON2_MEMORY_KIB,
  timeCost: env.ARGON2_TIME_COST,
});
await provisionAdmin(db, hasher, { email: 'admin@e2e.test', password: 'E2e-Admin-Password-1' });
await db.vehicle.createMany({
  data: [
    { make: 'Toyota', model: 'Corolla', category: 'SEDAN', priceCents: 2_199_000, quantity: 3 },
    { make: 'Honda', model: 'Civic', category: 'SEDAN', priceCents: 2_449_000, quantity: 5 },
    { make: 'Ford', model: 'F-150', category: 'TRUCK', priceCents: 4_199_000, quantity: 0 },
    {
      make: 'Mazda',
      model: 'MX-5 Miata',
      category: 'CONVERTIBLE',
      priceCents: 2_899_000,
      quantity: 1,
    },
    { make: 'Subaru', model: 'Outback', category: 'WAGON', priceCents: 3_199_000, quantity: 4 },
  ],
});
await db.$disconnect();
console.log('e2e database ready');
