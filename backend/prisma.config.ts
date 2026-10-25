import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// `prisma generate` only reads the schema and never connects, so it must work in a fresh clone
// before any .env exists. Every command that does connect (migrate, db seed, …) still requires a
// real DATABASE_URL and fails loudly without one.
const generateOnly = process.argv.includes('generate');

// Prisma 7: the connection URL lives here, not in schema.prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    url: generateOnly
      ? (process.env.DATABASE_URL ?? 'postgresql://generate-only@localhost:5432/none')
      : env('DATABASE_URL'),
  },
});
