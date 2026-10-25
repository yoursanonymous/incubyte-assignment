import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD, bearer, freshContext, registerUser, type TestContext } from '../support/app.js';
import { createPasswordHasher } from '../../src/modules/auth/password.js';
import { provisionAdmin } from '../../src/modules/auth/admin.provisioning.js';
import { validVehicle } from '../support/vehicles.js';

let ctx: TestContext;
const hasher = createPasswordHasher({ memoryKiB: 1024, timeCost: 1 });
beforeEach(async () => {
  ctx = await freshContext();
});
afterAll(async () => {
  await ctx?.db.$disconnect();
});

describe('provisionAdmin (the only way to create an administrator)', () => {
  it('creates an ADMIN who can log in and use admin endpoints', async () => {
    const result = await provisionAdmin(ctx.db, hasher, {
      email: 'Boss@Example.com',
      password: 'A-very-long-admin-pass-1',
    });
    expect(result).toMatchObject({ created: true });

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'boss@example.com', password: 'A-very-long-admin-pass-1' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('ADMIN');
    const created = await request(ctx.app)
      .post('/api/vehicles')
      .set(bearer(login.body.accessToken))
      .send(validVehicle);
    expect(created.status).toBe(201);
  });

  it('is idempotent: running twice neither duplicates nor changes the existing password', async () => {
    await provisionAdmin(ctx.db, hasher, {
      email: 'boss@example.com',
      password: 'A-very-long-admin-pass-1',
    });
    const again = await provisionAdmin(ctx.db, hasher, {
      email: 'boss@example.com',
      password: 'a-different-long-pass-22',
    });
    expect(again.created).toBe(false);
    expect(await ctx.db.user.count()).toBe(1);
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'boss@example.com', password: 'A-very-long-admin-pass-1' });
    expect(login.status).toBe(200);
  });

  it('can explicitly promote an existing customer', async () => {
    await registerUser(ctx.app, 'staff@example.com');
    const result = await provisionAdmin(ctx.db, hasher, {
      email: 'staff@example.com',
      password: PASSWORD + '-long',
    });
    expect(result.created).toBe(false);
    expect(
      (await ctx.db.user.findUniqueOrThrow({ where: { email: 'staff@example.com' } })).role,
    ).toBe('ADMIN');
  });

  it.each([
    [{ email: 'not-an-email', password: 'A-very-long-admin-pass-1' }],
    [{ email: 'a@example.com', password: 'short-pw-1' }],
    [{ email: 'a@example.com', password: 'ChangeMe-Admin-123!' }],
  ])('rejects invalid or known-default credentials %j', async (input) => {
    await expect(
      provisionAdmin(ctx.db, hasher, input, { forbidDefaultPassword: true }),
    ).rejects.toThrow();
    expect(await ctx.db.user.count()).toBe(0);
  });

  it('public registration still cannot produce an admin', async () => {
    const { user } = await registerUser(ctx.app, 'normal@example.com');
    expect(user.role).toBe('CUSTOMER');
  });
});
