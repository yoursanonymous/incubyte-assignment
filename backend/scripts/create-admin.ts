import 'dotenv/config';
import { loadEnv } from '../src/config/env.js';
import { createDb } from '../src/infrastructure/db.js';
import { provisionAdmin } from '../src/modules/auth/admin.provisioning.js';
import { createPasswordHasher } from '../src/modules/auth/password.js';

/** Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create -w backend */
const env = loadEnv();
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
  process.exit(1);
}

const db = createDb(env);
try {
  const result = await provisionAdmin(
    db,
    createPasswordHasher({ memoryKiB: env.ARGON2_MEMORY_KIB, timeCost: env.ARGON2_TIME_COST }),
    { email, password },
    { forbidDefaultPassword: env.NODE_ENV === 'production' },
  );
  console.log(`${result.created ? 'Created' : 'Promoted existing user as'} admin: ${result.email}`);
} finally {
  await db.$disconnect();
}
