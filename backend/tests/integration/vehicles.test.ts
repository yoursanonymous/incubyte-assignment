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
import { seedVehicle, validVehicle } from '../support/vehicles.js';

let ctx: TestContext;
let admin: string;
let customer: string;

beforeEach(async () => {
  ctx = await freshContext();
  admin = (await createAdmin(ctx)).token;
  customer = (await registerUser(ctx.app, 'customer@example.com')).token;
});
afterAll(async () => {
  await ctx?.db.$disconnect();
});

const list = (query = '', token = customer) =>
  request(ctx.app).get(`/api/vehicles${query}`).set(bearer(token));
const search = (query = '', token = customer) =>
  request(ctx.app).get(`/api/vehicles/search${query}`).set(bearer(token));

describe('authentication and authorization', () => {
  it('requires a token on every vehicle endpoint', async () => {
    const v = await seedVehicle(ctx.db);
    const calls = [
      request(ctx.app).get('/api/vehicles'),
      request(ctx.app).get('/api/vehicles/search'),
      request(ctx.app).get(`/api/vehicles/${v.id}`),
      request(ctx.app).post('/api/vehicles').send(validVehicle),
      request(ctx.app).put(`/api/vehicles/${v.id}`).send(validVehicle),
      request(ctx.app).delete(`/api/vehicles/${v.id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('forbids customers from creating, updating and deleting vehicles', async () => {
    const v = await seedVehicle(ctx.db);
    const { quantity: _q, ...replacement } = validVehicle;
    expect(
      (await request(ctx.app).post('/api/vehicles').set(bearer(customer)).send(validVehicle))
        .status,
    ).toBe(403);
    expect(
      (await request(ctx.app).put(`/api/vehicles/${v.id}`).set(bearer(customer)).send(replacement))
        .status,
    ).toBe(403);
    expect(
      (await request(ctx.app).delete(`/api/vehicles/${v.id}`).set(bearer(customer))).status,
    ).toBe(403);
    expect(await ctx.db.vehicle.count()).toBe(1);
    expect((await ctx.db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).archivedAt).toBeNull();
  });

  it('does not trust an ADMIN role claim inside a customer token (role comes from the database)', async () => {
    const me = await request(ctx.app).get('/api/auth/me').set(bearer(customer));
    const forged = await signTokenAt(
      ctx.env,
      { userId: me.body.user.id, role: 'ADMIN' },
      new Date(),
    );
    const res = await request(ctx.app).post('/api/vehicles').set(bearer(forged)).send(validVehicle);
    expect(res.status).toBe(403);
    expect(await ctx.db.vehicle.count()).toBe(0);
  });

  it('applies a demotion immediately, even to an unexpired admin token', async () => {
    await ctx.db.user.update({ where: { email: 'admin@example.com' }, data: { role: 'CUSTOMER' } });
    expect(
      (await request(ctx.app).post('/api/vehicles').set(bearer(admin)).send(validVehicle)).status,
    ).toBe(403);
  });
});

describe('POST /api/vehicles', () => {
  it('creates a vehicle with exact money and records an audit event', async () => {
    const res = await request(ctx.app).post('/api/vehicles').set(bearer(admin)).send(validVehicle);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      make: 'Honda',
      model: 'Civic',
      category: 'SEDAN',
      price: '24999.99',
      quantity: 4,
    });
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);

    const row = await ctx.db.vehicle.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.priceCents).toBe(2_499_999);

    const events = await ctx.db.auditEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'VEHICLE_CREATED',
      targetType: 'vehicle',
      targetId: res.body.data.id,
    });
  });

  it('accepts a JSON number price, trims names, uppercases category and defaults quantity to 0', async () => {
    const res = await request(ctx.app)
      .post('/api/vehicles')
      .set(bearer(admin))
      .send({ make: '  Ford ', model: ' F-150 ', category: 'truck', price: 45000 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      make: 'Ford',
      model: 'F-150',
      category: 'TRUCK',
      price: '45000.00',
      quantity: 0,
    });
  });

  it.each([
    ['negative price', { price: '-1' }],
    ['zero price', { price: '0' }],
    ['price above ceiling', { price: '10000000.01' }],
    ['three decimals', { price: '10.999' }],
    ['non-numeric price', { price: 'cheap' }],
    ['exponent price', { price: '1e5' }],
    ['float artefact price', { price: 0.1 + 0.2 }],
    ['unknown category', { category: 'SPACESHIP' }],
    ['negative quantity', { quantity: -1 }],
    ['fractional quantity', { quantity: 1.5 }],
    ['quantity above stock cap', { quantity: 100_001 }],
    ['string quantity', { quantity: '5' }],
    ['blank make', { make: '   ' }],
    ['make too long', { make: 'x'.repeat(61) }],
    ['client-supplied id', { id: '00000000-0000-0000-0000-000000000000' }],
    ['client-supplied archivedAt', { archivedAt: null }],
  ])('rejects %s with 400 and creates nothing', async (_name, override) => {
    const res = await request(ctx.app)
      .post('/api/vehicles')
      .set(bearer(admin))
      .send({ ...validVehicle, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await ctx.db.vehicle.count()).toBe(0);
  });

  it('accepts boundary values', async () => {
    const max = await request(ctx.app)
      .post('/api/vehicles')
      .set(bearer(admin))
      .send({ ...validVehicle, price: '10000000.00', quantity: 100_000 });
    const min = await request(ctx.app)
      .post('/api/vehicles')
      .set(bearer(admin))
      .send({ ...validVehicle, price: '0.01', quantity: 0 });
    expect([max.status, min.status]).toEqual([201, 201]);
  });
});

describe('GET /api/vehicles (listing and pagination)', () => {
  it('returns a paginated envelope, including out-of-stock vehicles, excluding archived ones', async () => {
    await seedVehicle(ctx.db, { make: 'Audi', model: 'A4' });
    await seedVehicle(ctx.db, { make: 'BMW', model: 'M3', quantity: 0 });
    await seedVehicle(ctx.db, { make: 'Ghost', model: 'Gone', archivedAt: new Date() });

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data.map((v: { make: string }) => v.make)).toEqual(['Audi', 'BMW']);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 12, total: 2, totalPages: 1 });
    expect(res.body.data[0]).not.toHaveProperty('archivedAt');
  });

  it('paginates deterministically with stable ordering across pages', async () => {
    await ctx.db.vehicle.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        make: 'Same',
        model: 'Same',
        category: 'SEDAN' as const,
        priceCents: 100_000 + i,
        quantity: 1,
      })),
    });
    const [p1, p2, p3] = await Promise.all([
      list('?pageSize=10&page=1'),
      list('?pageSize=10&page=2'),
      list('?pageSize=10&page=3'),
    ]);
    expect(p1.body.data).toHaveLength(10);
    expect(p2.body.data).toHaveLength(10);
    expect(p3.body.data).toHaveLength(5);
    expect(p1.body.pagination).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });

    const ids = [...p1.body.data, ...p2.body.data, ...p3.body.data].map(
      (v: { id: string }) => v.id,
    );
    expect(new Set(ids).size).toBe(25); // no duplicates or gaps despite identical make/model
    const again = await list('?pageSize=10&page=2');
    expect(again.body.data.map((v: { id: string }) => v.id)).toEqual(
      p2.body.data.map((v: { id: string }) => v.id),
    );
  });

  it('returns an empty page (not an error) past the last page', async () => {
    await seedVehicle(ctx.db);
    const res = await list('?page=9');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(1);
  });

  it.each([
    '?pageSize=101',
    '?pageSize=0',
    '?page=0',
    '?page=-1',
    '?page=abc',
    '?pageSize=1.5',
    '?page=100001',
  ])('rejects bad pagination %s', async (q) => {
    expect((await list(q)).status).toBe(400);
  });

  it('sorts by allowlisted fields and rejects anything else (no SQL injection via sort)', async () => {
    await seedVehicle(ctx.db, { make: 'A', priceCents: 300 });
    await seedVehicle(ctx.db, { make: 'B', priceCents: 100 });
    await seedVehicle(ctx.db, { make: 'C', priceCents: 200 });
    const asc = await list('?sort=price&order=asc');
    expect(asc.body.data.map((v: { price: string }) => v.price)).toEqual(['1.00', '2.00', '3.00']);
    const desc = await list('?sort=price&order=desc');
    expect(desc.body.data.map((v: { price: string }) => v.price)).toEqual(['3.00', '2.00', '1.00']);
    expect((await list('?sort=passwordHash')).status).toBe(400);
    expect((await list('?sort=price;DROP TABLE vehicles')).status).toBe(400);
    expect((await list('?order=sideways')).status).toBe(400);
  });

  it('rejects unknown query parameters', async () => {
    expect((await list('?foo=bar')).status).toBe(400);
  });
});

describe('GET /api/vehicles/search', () => {
  beforeEach(async () => {
    await seedVehicle(ctx.db, {
      make: 'Toyota',
      model: 'Corolla',
      category: 'SEDAN',
      priceCents: 2_000_000,
      quantity: 3,
    });
    await seedVehicle(ctx.db, {
      make: 'Toyota',
      model: 'Hilux',
      category: 'TRUCK',
      priceCents: 3_500_000,
      quantity: 0,
    });
    await seedVehicle(ctx.db, {
      make: 'Honda',
      model: 'CR-V',
      category: 'SUV',
      priceCents: 3_000_000,
      quantity: 2,
    });
    await seedVehicle(ctx.db, {
      make: 'Tesla',
      model: 'Model 3',
      category: 'SEDAN',
      priceCents: 4_000_000,
      quantity: 1,
    });
  });
  const models = (res: request.Response) =>
    res.body.data.map((v: { model: string }) => v.model).sort();

  it('matches make case-insensitively and by partial text', async () => {
    expect(models(await search('?make=toy'))).toEqual(['Corolla', 'Hilux']);
    expect(models(await search('?make=HONDA'))).toEqual(['CR-V']);
  });

  it('matches model partially', async () => {
    expect(models(await search('?model=model'))).toEqual(['Model 3']);
  });

  it('filters by category', async () => {
    expect(models(await search('?category=SEDAN'))).toEqual(['Corolla', 'Model 3']);
    expect(models(await search('?category=suv'))).toEqual(['CR-V']);
    expect((await search('?category=BOAT')).status).toBe(400);
  });

  it('filters by an inclusive price range using exact decimal strings', async () => {
    expect(models(await search('?minPrice=30000&maxPrice=35000'))).toEqual(['CR-V', 'Hilux']);
    expect(models(await search('?minPrice=40000.00'))).toEqual(['Model 3']);
    expect(models(await search('?maxPrice=20000'))).toEqual(['Corolla']);
  });

  it('rejects an inverted or malformed price range', async () => {
    expect((await search('?minPrice=50000&maxPrice=100')).status).toBe(400);
    expect((await search('?minPrice=abc')).status).toBe(400);
    expect((await search('?maxPrice=-5')).status).toBe(400);
  });

  it('filters by availability', async () => {
    expect(models(await search('?make=toyota&inStock=true'))).toEqual(['Corolla']);
    expect(models(await search('?inStock=false'))).toEqual(['Hilux']);
  });

  it('combines filters with AND and reports totals for the filtered set', async () => {
    const res = await search('?make=toyota&category=TRUCK&maxPrice=40000');
    expect(models(res)).toEqual(['Hilux']);
    expect(res.body.pagination.total).toBe(1);
    expect((await search('?make=toyota&category=SUV')).body.data).toEqual([]);
  });

  it('treats SQL metacharacters and LIKE wildcards as literal text', async () => {
    for (const payload of ["' OR '1'='1", "'; DROP TABLE vehicles;--", '%', '_', '%%', '\\']) {
      const res = await search(`?make=${encodeURIComponent(payload)}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
    expect(await ctx.db.vehicle.count()).toBe(4);
  });

  it('matches wildcard characters literally when the data really contains them', async () => {
    await seedVehicle(ctx.db, { make: '50%off', model: 'Promo', quantity: 1 });
    await seedVehicle(ctx.db, { make: 'a_b', model: 'Under', quantity: 1 });
    await seedVehicle(ctx.db, { make: 'back\\slash', model: 'Slash', quantity: 1 });
    expect(models(await search('?make=%25'))).toEqual(['Promo']);
    expect(models(await search('?make=_'))).toEqual(['Under']);
    expect(models(await search('?make=%5C'))).toEqual(['Slash']);
  });

  it('is routed before /:id (search is not mistaken for an id)', async () => {
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(4);
  });
});

describe('GET /api/vehicles/:id', () => {
  it('returns the vehicle', async () => {
    const v = await seedVehicle(ctx.db, { make: 'Mazda', model: 'MX-5', priceCents: 2_999_900 });
    const res = await request(ctx.app).get(`/api/vehicles/${v.id}`).set(bearer(customer));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: v.id, make: 'Mazda', price: '29999.00' });
  });

  it('returns 404 for unknown and archived vehicles, 400 for malformed ids', async () => {
    const archived = await seedVehicle(ctx.db, { archivedAt: new Date() });
    expect(
      (
        await request(ctx.app)
          .get('/api/vehicles/00000000-0000-4000-8000-000000000000')
          .set(bearer(customer))
      ).status,
    ).toBe(404);
    expect(
      (await request(ctx.app).get(`/api/vehicles/${archived.id}`).set(bearer(customer))).status,
    ).toBe(404);
    expect(
      (await request(ctx.app).get('/api/vehicles/not-a-uuid').set(bearer(customer))).status,
    ).toBe(400);
  });
});

describe('PUT /api/vehicles/:id', () => {
  const replacement = {
    make: 'Toyota',
    model: 'Corolla Cross',
    category: 'SUV',
    price: '27500.50',
  };

  it('updates editable fields, bumps updatedAt and audits the changed field names', async () => {
    const v = await seedVehicle(ctx.db);
    const res = await request(ctx.app)
      .put(`/api/vehicles/${v.id}`)
      .set(bearer(admin))
      .send(replacement);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      model: 'Corolla Cross',
      category: 'SUV',
      price: '27500.50',
      quantity: 5,
    });
    expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThan(v.updatedAt.getTime());

    const event = await ctx.db.auditEvent.findFirstOrThrow({
      where: { action: 'VEHICLE_UPDATED' },
    });
    expect(event.targetId).toBe(v.id);
    expect(event.metadata).toMatchObject({
      changedFields: expect.arrayContaining(['model', 'category', 'price']),
    });
  });

  it('cannot change stock: quantity and other protected fields are rejected', async () => {
    const v = await seedVehicle(ctx.db, { quantity: 5 });
    for (const extra of [{ quantity: 999 }, { id: 'x' }, { archivedAt: null }]) {
      expect(
        (
          await request(ctx.app)
            .put(`/api/vehicles/${v.id}`)
            .set(bearer(admin))
            .send({ ...replacement, ...extra })
        ).status,
      ).toBe(400);
    }
    expect((await ctx.db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).quantity).toBe(5);
  });

  it('is a full replacement of editable fields: missing fields are rejected', async () => {
    const v = await seedVehicle(ctx.db);
    expect(
      (
        await request(ctx.app)
          .put(`/api/vehicles/${v.id}`)
          .set(bearer(admin))
          .send({ make: 'Only' })
      ).status,
    ).toBe(400);
  });

  it('returns 404 for unknown or archived vehicles', async () => {
    const archived = await seedVehicle(ctx.db, { archivedAt: new Date() });
    expect(
      (
        await request(ctx.app)
          .put('/api/vehicles/00000000-0000-4000-8000-000000000000')
          .set(bearer(admin))
          .send(replacement)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(ctx.app)
          .put(`/api/vehicles/${archived.id}`)
          .set(bearer(admin))
          .send(replacement)
      ).status,
    ).toBe(404);
  });

  it('detects conflicting edits with optimistic concurrency (409)', async () => {
    const v = await seedVehicle(ctx.db);
    const first = await request(ctx.app)
      .put(`/api/vehicles/${v.id}`)
      .set(bearer(admin))
      .send({ ...replacement, expectedUpdatedAt: v.updatedAt.toISOString() });
    expect(first.status).toBe(200);
    // A second editor still holding the original timestamp must not silently overwrite the first.
    const stale = await request(ctx.app)
      .put(`/api/vehicles/${v.id}`)
      .set(bearer(admin))
      .send({ ...replacement, price: '1.00', expectedUpdatedAt: v.updatedAt.toISOString() });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');
    expect((await ctx.db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).priceCents).toBe(
      2_750_050,
    );
  });
});

describe('DELETE /api/vehicles/:id (soft delete)', () => {
  it('archives the vehicle, hides it everywhere and audits the action', async () => {
    const v = await seedVehicle(ctx.db);
    const res = await request(ctx.app).delete(`/api/vehicles/${v.id}`).set(bearer(admin));
    expect(res.status).toBe(204);

    expect((await request(ctx.app).get(`/api/vehicles/${v.id}`).set(bearer(customer))).status).toBe(
      404,
    );
    expect((await list()).body.data).toEqual([]);
    const row = await ctx.db.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(row.archivedAt).not.toBeNull(); // row (and any purchase history) is preserved
    expect(
      await ctx.db.auditEvent.count({ where: { action: 'VEHICLE_ARCHIVED', targetId: v.id } }),
    ).toBe(1);
  });

  it('returns 404 when deleting twice or deleting an unknown id', async () => {
    const v = await seedVehicle(ctx.db);
    await request(ctx.app).delete(`/api/vehicles/${v.id}`).set(bearer(admin));
    expect((await request(ctx.app).delete(`/api/vehicles/${v.id}`).set(bearer(admin))).status).toBe(
      404,
    );
    expect(
      (
        await request(ctx.app)
          .delete('/api/vehicles/00000000-0000-4000-8000-000000000000')
          .set(bearer(admin))
      ).status,
    ).toBe(404);
  });
});
