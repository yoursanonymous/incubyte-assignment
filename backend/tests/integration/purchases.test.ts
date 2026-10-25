import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bearer,
  createAdmin,
  freshContext,
  registerUser,
  signTokenAt,
  type TestContext,
} from '../support/app.js';
import { seedVehicle } from '../support/vehicles.js';

let ctx: TestContext;
let admin: string;
let buyer: { token: string; user: { id: string } };

beforeEach(async () => {
  ctx = await freshContext();
  admin = (await createAdmin(ctx)).token;
  buyer = await registerUser(ctx.app, 'buyer@example.com');
});
afterAll(async () => {
  await ctx?.db.$disconnect();
});

const purchase = (id: string, body: object = {}, token = buyer.token, key?: string) => {
  const req = request(ctx.app).post(`/api/vehicles/${id}/purchase`).set(bearer(token));
  return (key ? req.set('Idempotency-Key', key) : req).send(body);
};
const restock = (id: string, body: object, token = admin) =>
  request(ctx.app).post(`/api/vehicles/${id}/restock`).set(bearer(token)).send(body);
const stockOf = async (id: string) =>
  (await ctx.db.vehicle.findUniqueOrThrow({ where: { id } })).quantity;

/** Invariant I2: initial + restocked - purchased === current stock. */
async function expectLedgerBalanced(id: string, initial: number, restocked = 0) {
  const sold = await ctx.db.purchase.aggregate({
    where: { vehicleId: id },
    _sum: { quantity: true },
  });
  expect(initial + restocked - (sold._sum.quantity ?? 0)).toBe(await stockOf(id));
}

describe('POST /api/vehicles/:id/purchase', () => {
  it('decreases stock and records the purchase with exact price and total', async () => {
    const v = await seedVehicle(ctx.db, { priceCents: 2_499_999, quantity: 5 });
    const res = await purchase(v.id, { quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      vehicleId: v.id,
      quantity: 3,
      unitPrice: '24999.99',
      total: '74999.97',
      remainingStock: 2,
    });
    expect(await stockOf(v.id)).toBe(2);

    const row = await ctx.db.purchase.findFirstOrThrow();
    expect(row).toMatchObject({
      userId: buyer.user.id,
      unitPriceCents: 2_499_999,
      totalCents: 7_499_997n,
      quantity: 3,
    });
    expect(
      await ctx.db.auditEvent.count({
        where: { action: 'VEHICLE_PURCHASED', actorId: buyer.user.id },
      }),
    ).toBe(1);
  });

  it('defaults to a quantity of one', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 2 });
    expect((await purchase(v.id)).body.data.quantity).toBe(1);
    expect(await stockOf(v.id)).toBe(1);
  });

  it('can sell the last unit but never more: stock never goes negative', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 1 });
    expect((await purchase(v.id)).status).toBe(201);
    const second = await purchase(v.id);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { available: 0 },
    });
    expect(await stockOf(v.id)).toBe(0);
    expect(await ctx.db.purchase.count()).toBe(1);
  });

  it('rejects a request for more than is in stock without changing anything', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 2 });
    const res = await purchase(v.id, { quantity: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ available: 2 });
    expect(await stockOf(v.id)).toBe(2);
    expect(await ctx.db.purchase.count()).toBe(0);
    expect(await ctx.db.auditEvent.count({ where: { action: 'VEHICLE_PURCHASED' } })).toBe(0);
  });

  it.each([
    ['zero', { quantity: 0 }],
    ['negative', { quantity: -1 }],
    ['fractional', { quantity: 1.5 }],
    ['above the per-purchase limit', { quantity: 11 }],
    ['numeric string', { quantity: '2' }],
    ['null', { quantity: null }],
    ['client-supplied price (tampering)', { quantity: 1, price: '1.00' }],
    ['client-supplied userId', { quantity: 1, userId: 'x' }],
  ])('rejects %s with 400', async (_name, body) => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    const res = await purchase(v.id, body);
    expect(res.status).toBe(400);
    expect(await stockOf(v.id)).toBe(5);
  });

  it('returns 404 for unknown or archived vehicles and 400 for malformed ids; 401 without a token', async () => {
    const archived = await seedVehicle(ctx.db, { archivedAt: new Date() });
    expect((await purchase('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await purchase(archived.id)).status).toBe(404);
    expect((await purchase('nope')).status).toBe(400);
    expect(
      (await request(ctx.app).post(`/api/vehicles/${archived.id}/purchase`).send({})).status,
    ).toBe(401);
  });

  it('keeps the price captured at purchase time when the price later changes (I4)', async () => {
    const v = await seedVehicle(ctx.db, { priceCents: 1_000_000, quantity: 3 });
    await purchase(v.id);
    await request(ctx.app)
      .put(`/api/vehicles/${v.id}`)
      .set(bearer(admin))
      .send({ make: v.make, model: v.model, category: v.category, price: '9999.00' });
    await purchase(v.id);
    const rows = await ctx.db.purchase.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.unitPriceCents)).toEqual([1_000_000, 999_900]);
  });

  it('leaves no partial change when a later step in the transaction fails (atomic rollback)', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    await ctx.db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_fail_audit();`);
    try {
      const res = await purchase(v.id, { quantity: 2 });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/simulated|trigger|plpgsql/i); // no internals leaked
    } finally {
      await ctx.db.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS test_fail_audit ON audit_events; DROP FUNCTION IF EXISTS test_fail_audit();',
      );
    }
    expect(await stockOf(v.id)).toBe(5); // the decrement was rolled back
    expect(await ctx.db.purchase.count()).toBe(0);
  });
});

describe('concurrency: no overselling', () => {
  async function buyers(n: number) {
    const users = [];
    for (let i = 0; i < n; i++) users.push(await registerUser(ctx.app, `racer${i}@example.com`));
    return users;
  }

  it('20 simultaneous single-unit purchases of 5 units: exactly 5 succeed', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    const users = await buyers(20);
    const results = await Promise.all(users.map((u) => purchase(v.id, { quantity: 1 }, u.token)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(15);
    expect(results.filter((r) => ![201, 409].includes(r.status))).toHaveLength(0);
    expect(await stockOf(v.id)).toBe(0);
    expect(await ctx.db.purchase.count()).toBe(5);
    await expectLedgerBalanced(v.id, 5);
  });

  it('multi-unit purchases cannot jointly exceed stock (stock 5, ten buyers of 2)', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    const users = await buyers(10);
    const results = await Promise.all(users.map((u) => purchase(v.id, { quantity: 2 }, u.token)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(await stockOf(v.id)).toBe(1);
    await expectLedgerBalanced(v.id, 5);
  });

  it('purchases racing with restocks keep the ledger balanced', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 3 });
    const users = await buyers(12);
    const ops = [
      ...users.map((u) => purchase(v.id, { quantity: 1 }, u.token)),
      restock(v.id, { quantity: 4 }),
      restock(v.id, { quantity: 4 }),
    ];
    const results = await Promise.all(ops);
    const restocked = results.slice(-2).filter((r) => r.status === 200).length * 4;
    expect(restocked).toBe(8);
    expect(await stockOf(v.id)).toBeGreaterThanOrEqual(0);
    await expectLedgerBalanced(v.id, 3, restocked);
  });
});

describe('idempotency (Idempotency-Key header)', () => {
  it('replays the original outcome and charges only once', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    const first = await purchase(v.id, { quantity: 2 }, buyer.token, 'key-abc-123');
    const replay = await purchase(v.id, { quantity: 2 }, buyer.token, 'key-abc-123');

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(await stockOf(v.id)).toBe(3);
    expect(await ctx.db.purchase.count()).toBe(1);
  });

  it('collapses simultaneous retries with the same key into one purchase', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 10 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => purchase(v.id, { quantity: 1 }, buyer.token, 'dup-key-001')),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await ctx.db.purchase.count()).toBe(1);
    expect(await stockOf(v.id)).toBe(9);
  });

  it('forces overlapping same-key requests (row lock held) and still creates exactly one purchase', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 10 });
    let inFlight: ReturnType<typeof purchase>[] = [];

    // Hold the vehicle row lock so every request is guaranteed to be mid-transaction at once.
    await ctx.db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1::uuid FOR UPDATE', v.id);
      inFlight = Array.from({ length: 6 }, () =>
        purchase(v.id, { quantity: 1 }, buyer.token, 'overlap-key-1'),
      );
      inFlight.forEach(
        (p) =>
          void p.then(
            () => undefined,
            () => undefined,
          ),
      ); // start the requests now
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    const results = await Promise.all(inFlight);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await ctx.db.purchase.count()).toBe(1);
    expect(await stockOf(v.id)).toBe(9);
  });

  it('rejects reuse of a key for a different request with 422', async () => {
    const a = await seedVehicle(ctx.db, { quantity: 5 });
    const b = await seedVehicle(ctx.db, { make: 'Other', quantity: 5 });
    await purchase(a.id, { quantity: 1 }, buyer.token, 'shared-key-1');
    const diffQty = await purchase(a.id, { quantity: 2 }, buyer.token, 'shared-key-1');
    const diffVehicle = await purchase(b.id, { quantity: 1 }, buyer.token, 'shared-key-1');
    expect(diffQty.status).toBe(422);
    expect(diffQty.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(diffVehicle.status).toBe(422);
    expect(await stockOf(a.id)).toBe(4);
    expect(await stockOf(b.id)).toBe(5);
  });

  it('scopes keys to the authenticated user', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    const other = await registerUser(ctx.app, 'other@example.com');
    const a = await purchase(v.id, {}, buyer.token, 'same-key-xyz');
    const b = await purchase(v.id, {}, other.token, 'same-key-xyz');
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.id).not.toBe(b.body.data.id);
    expect(await stockOf(v.id)).toBe(3);
  });

  it('does not consume the key when the purchase fails, so a retry after restock succeeds', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 0 });
    expect((await purchase(v.id, {}, buyer.token, 'retry-key-1')).status).toBe(409);
    await restock(v.id, { quantity: 1 });
    expect((await purchase(v.id, {}, buyer.token, 'retry-key-1')).status).toBe(201);
    expect(await ctx.db.purchase.count()).toBe(1);
  });

  it.each(['has spaces', 'x'.repeat(129), 'bad/slash', ''])(
    'rejects invalid key %j with 400',
    async (key) => {
      const v = await seedVehicle(ctx.db, { quantity: 1 });
      const res = await request(ctx.app)
        .post(`/api/vehicles/${v.id}/purchase`)
        .set(bearer(buyer.token))
        .set('Idempotency-Key', key)
        .send({});
      expect(res.status).toBe(400);
      expect(await stockOf(v.id)).toBe(1);
    },
  );

  it('without a key, two identical requests are two purchases (documented behaviour)', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    await purchase(v.id);
    await purchase(v.id);
    expect(await ctx.db.purchase.count()).toBe(2);
  });
});

describe('POST /api/vehicles/:id/restock (admin only)', () => {
  it('increases stock atomically and audits the change', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 2 });
    const res = await restock(v.id, { quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: v.id, quantity: 12 });
    const event = await ctx.db.auditEvent.findFirstOrThrow({
      where: { action: 'VEHICLE_RESTOCKED' },
    });
    expect(event.metadata).toMatchObject({ quantity: 10, newQuantity: 12 });
  });

  it('rejects customers and forged-admin tokens without touching stock', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 2 });
    expect((await restock(v.id, { quantity: 5 }, buyer.token)).status).toBe(403);
    const forged = await signTokenAt(ctx.env, { userId: buyer.user.id, role: 'ADMIN' }, new Date());
    expect((await restock(v.id, { quantity: 5 }, forged)).status).toBe(403);
    expect(
      (await request(ctx.app).post(`/api/vehicles/${v.id}/restock`).send({ quantity: 5 })).status,
    ).toBe(401);
    expect(await stockOf(v.id)).toBe(2);
  });

  it.each([
    ['zero', { quantity: 0 }],
    ['negative', { quantity: -5 }],
    ['fractional', { quantity: 2.5 }],
    ['above per-request limit', { quantity: 1001 }],
    ['string', { quantity: '5' }],
    ['missing', {}],
    ['unknown field', { quantity: 1, price: 1 }],
  ])('rejects %s with 400', async (_name, body) => {
    const v = await seedVehicle(ctx.db, { quantity: 2 });
    expect((await restock(v.id, body)).status).toBe(400);
    expect(await stockOf(v.id)).toBe(2);
  });

  it('refuses to exceed the maximum stock (overflow guard)', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 99_999 });
    const res = await restock(v.id, { quantity: 5 });
    expect(res.status).toBe(409);
    expect(await stockOf(v.id)).toBe(99_999);
    expect((await restock(v.id, { quantity: 1 })).status).toBe(200);
  });

  it('returns 404 for unknown or archived vehicles', async () => {
    const archived = await seedVehicle(ctx.db, { archivedAt: new Date() });
    expect((await restock(archived.id, { quantity: 1 })).status).toBe(404);
    expect((await restock('00000000-0000-4000-8000-000000000000', { quantity: 1 })).status).toBe(
      404,
    );
  });
});

describe('purchase history', () => {
  it("GET /api/purchases/mine returns only the caller's purchases, newest first, with a vehicle snapshot", async () => {
    const v = await seedVehicle(ctx.db, { make: 'Kia', model: 'Soul', quantity: 9 });
    const other = await registerUser(ctx.app, 'other@example.com');
    await purchase(v.id, { quantity: 1 });
    await purchase(v.id, { quantity: 2 });
    await purchase(v.id, { quantity: 4 }, other.token);

    const res = await request(ctx.app).get('/api/purchases/mine').set(bearer(buyer.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { quantity: number }) => p.quantity)).toEqual([2, 1]);
    expect(res.body.data[0]).toMatchObject({
      vehicle: { make: 'Kia', model: 'Soul' },
      total: expect.any(String),
    });
    expect(res.body.pagination.total).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain(other.user.id);
  });

  it('survives archiving the vehicle (history is preserved)', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 2 });
    await purchase(v.id);
    await request(ctx.app).delete(`/api/vehicles/${v.id}`).set(bearer(admin));
    const res = await request(ctx.app).get('/api/purchases/mine').set(bearer(buyer.token));
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/purchases is admin-only and lists everyone', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    await purchase(v.id);
    expect((await request(ctx.app).get('/api/purchases').set(bearer(buyer.token))).status).toBe(
      403,
    );
    expect((await request(ctx.app).get('/api/purchases')).status).toBe(401);
    const all = await request(ctx.app).get('/api/purchases').set(bearer(admin));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(1);
    expect(all.body.data[0].customer.email).toBe('buyer@example.com');
  });

  it('paginates and validates query parameters', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 9 });
    for (let i = 0; i < 3; i++) await purchase(v.id);
    const res = await request(ctx.app)
      .get('/api/purchases/mine?pageSize=2&page=2')
      .set(bearer(buyer.token));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(
      (await request(ctx.app).get('/api/purchases/mine?pageSize=500').set(bearer(buyer.token)))
        .status,
    ).toBe(400);
  });
});
