import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, resetDb } from '../support/db.js';

const db = createTestDb();

async function insertUser(email = 'buyer@example.com') {
  return db.user.create({ data: { email, passwordHash: 'hash' } });
}
async function insertVehicle(overrides: Record<string, unknown> = {}) {
  return db.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Corolla',
      category: 'SEDAN',
      priceCents: 2_000_000,
      quantity: 3,
      ...overrides,
    },
  });
}

describe('database constraints (defence in depth behind application validation)', () => {
  beforeEach(() => resetDb(db));
  afterAll(() => db.$disconnect());

  it('rejects negative vehicle quantity', async () => {
    await expect(insertVehicle({ quantity: -1 })).rejects.toThrow();
  });

  it('rejects quantity above the stock cap', async () => {
    await expect(insertVehicle({ quantity: 100_001 })).rejects.toThrow();
  });

  it('rejects zero or negative prices and prices above the ceiling', async () => {
    await expect(insertVehicle({ priceCents: 0 })).rejects.toThrow();
    await expect(insertVehicle({ priceCents: -5 })).rejects.toThrow();
    await expect(insertVehicle({ priceCents: 1_000_000_001 })).rejects.toThrow();
  });

  it('rejects blank make or model', async () => {
    await expect(insertVehicle({ make: '   ' })).rejects.toThrow();
    await expect(insertVehicle({ model: '' })).rejects.toThrow();
  });

  it('accepts boundary values', async () => {
    await expect(insertVehicle({ quantity: 0, priceCents: 1 })).resolves.toBeTruthy();
    await expect(
      insertVehicle({ quantity: 100_000, priceCents: 1_000_000_000 }),
    ).resolves.toBeTruthy();
  });

  it('stores only lowercase emails', async () => {
    await expect(insertUser('Mixed@Example.com')).rejects.toThrow();
    await expect(insertUser('mixed@example.com')).resolves.toBeTruthy();
  });

  it('enforces unique emails', async () => {
    await insertUser('dup@example.com');
    await expect(insertUser('dup@example.com')).rejects.toThrow();
  });

  it('rejects purchase quantities outside 1..10 and inconsistent totals', async () => {
    const user = await insertUser();
    const vehicle = await insertVehicle();
    const base = { userId: user.id, vehicleId: vehicle.id, unitPriceCents: 2_000_000 };
    await expect(
      db.purchase.create({ data: { ...base, quantity: 0, totalCents: 0n } }),
    ).rejects.toThrow();
    await expect(
      db.purchase.create({ data: { ...base, quantity: 11, totalCents: 22_000_000n } }),
    ).rejects.toThrow();
    await expect(
      db.purchase.create({ data: { ...base, quantity: 2, totalCents: 1n } }),
    ).rejects.toThrow();
    await expect(
      db.purchase.create({ data: { ...base, quantity: 2, totalCents: 4_000_000n } }),
    ).resolves.toBeTruthy();
  });

  it('does not allow deleting a vehicle or user that has purchase history', async () => {
    const user = await insertUser();
    const vehicle = await insertVehicle();
    await db.purchase.create({
      data: {
        userId: user.id,
        vehicleId: vehicle.id,
        quantity: 1,
        unitPriceCents: 2_000_000,
        totalCents: 2_000_000n,
      },
    });
    await expect(db.vehicle.delete({ where: { id: vehicle.id } })).rejects.toThrow();
    await expect(db.user.delete({ where: { id: user.id } })).rejects.toThrow();
  });
});
