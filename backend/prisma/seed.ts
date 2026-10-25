import 'dotenv/config';
import { loadEnv } from '../src/config/env.js';
import { createDb } from '../src/infrastructure/db.js';
import { provisionAdmin } from '../src/modules/auth/admin.provisioning.js';
import { createPasswordHasher } from '../src/modules/auth/password.js';

/**
 * DEVELOPMENT SAMPLE DATA ONLY. Refuses to run in production, never deletes anything, and does
 * nothing if vehicles already exist, so it is safe to run repeatedly.
 */
const env = loadEnv();
if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed sample data in production.');
  process.exit(1);
}

const hasher = createPasswordHasher({
  memoryKiB: env.ARGON2_MEMORY_KIB,
  timeCost: env.ARGON2_TIME_COST,
});
const db = createDb(env);

const SAMPLE = [
  ['Toyota', 'Corolla', 'SEDAN', 2_199_000, 8],
  ['Toyota', 'RAV4', 'SUV', 3_149_000, 5],
  ['Toyota', 'Tacoma', 'TRUCK', 3_499_000, 0],
  ['Honda', 'Civic', 'SEDAN', 2_449_000, 6],
  ['Honda', 'CR-V', 'SUV', 3_299_000, 4],
  ['Ford', 'F-150', 'TRUCK', 4_199_000, 3],
  ['Ford', 'Mustang', 'COUPE', 4_299_000, 2],
  ['Mazda', 'MX-5 Miata', 'CONVERTIBLE', 2_899_000, 1],
  ['Volkswagen', 'Golf', 'HATCHBACK', 2_599_000, 7],
  ['Volkswagen', 'Transporter', 'VAN', 4_099_000, 2],
  ['Subaru', 'Outback', 'WAGON', 3_199_000, 5],
  ['Tesla', 'Model 3', 'SEDAN', 4_299_000, 4],
  ['BMW', 'M4', 'COUPE', 8_499_000, 1],
  ['Kia', 'Sportage', 'SUV', 2_999_000, 0],
] as const;

try {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@dealership.test';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Admin-123!';
  const admin = await provisionAdmin(db, hasher, { email: adminEmail, password: adminPassword });
  console.log(`Admin: ${admin.email} (${admin.created ? 'created' : 'already existed'})`);

  if ((await db.user.findUnique({ where: { email: 'customer@dealership.test' } })) === null) {
    await db.user.create({
      data: {
        email: 'customer@dealership.test',
        passwordHash: await hasher.hash('Customer-Demo-123!'),
      },
    });
    console.log('Demo customer: customer@dealership.test');
  }

  if ((await db.vehicle.count()) === 0) {
    await db.vehicle.createMany({
      data: SAMPLE.map(([make, model, category, priceCents, quantity]) => ({
        make,
        model,
        category,
        priceCents,
        quantity,
      })),
    });
    console.log(`Inserted ${SAMPLE.length} sample vehicles.`);
  } else {
    console.log('Vehicles already present; leaving them untouched.');
  }
} finally {
  await db.$disconnect();
}
