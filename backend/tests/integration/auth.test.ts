import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bearer,
  extractRefreshCookie,
  freshContext,
  PASSWORD,
  registerUser,
  signTokenAt,
  type TestContext,
} from '../support/app.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await freshContext();
});
afterAll(async () => {
  await ctx?.db.$disconnect();
});

const cookieValue = (setCookie: string) => setCookie.split(';')[0]!;

describe('POST /api/auth/register', () => {
  it('creates a CUSTOMER, returns a token and sets a hardened refresh cookie', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: '  New.User@Example.COM ', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new.user@example.com', role: 'CUSTOMER' });
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.expiresIn).toBe(900);

    const cookie = extractRefreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('never exposes the password or its hash, and stores an Argon2id hash', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: PASSWORD });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(PASSWORD);
    expect(body.toLowerCase()).not.toContain('hash');
    const row = await ctx.db.user.findUniqueOrThrow({ where: { email: 'a@example.com' } });
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects an attempt to choose a role or any other unknown field (no privilege escalation)', async () => {
    for (const extra of [{ role: 'ADMIN' }, { status: 'ACTIVE' }, { id: 'x' }, { isAdmin: true }]) {
      const res = await request(ctx.app)
        .post('/api/auth/register')
        .send({ email: 'evil@example.com', password: PASSWORD, ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await ctx.db.user.count()).toBe(0);
  });

  it.each([
    [{ email: 'not-an-email', password: PASSWORD }, 'email'],
    [{ email: 'a@example.com', password: 'short' }, 'password'],
    [{ email: 'a@example.com', password: 'x'.repeat(129) }, 'password'],
    [{ email: 'a@example.com' }, 'password'],
    [{ password: PASSWORD }, 'email'],
  ])('rejects invalid input %j', async (payload, field) => {
    const res = await request(ctx.app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details)).toContain(field);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('rejects a missing or non-JSON body with 400', async () => {
    expect((await request(ctx.app).post('/api/auth/register')).status).toBe(400);
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/register')
          .set('Content-Type', 'text/plain')
          .send('hi')
      ).status,
    ).toBe(400);
  });

  it('returns 409 for a duplicate email regardless of case', async () => {
    await registerUser(ctx.app, 'dup@example.com');
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'DUP@example.com', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('only one of several simultaneous registrations for the same email succeeds', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(ctx.app)
          .post('/api/auth/register')
          .send({ email: 'race@example.com', password: PASSWORD }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await ctx.db.user.count()).toBe(1);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser(ctx.app, 'login@example.com');
  });

  it('authenticates valid credentials (email is case-insensitive)', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'LOGIN@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('login@example.com');
    expect(extractRefreshCookie(res)).toBeDefined();
  });

  it('gives the same generic 401 for a wrong password and an unknown email', async () => {
    const wrong = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Wrong-password-1' });
    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a disabled account with the same generic error', async () => {
    await ctx.db.user.update({
      where: { email: 'login@example.com' },
      data: { status: 'DISABLED' },
    });
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects malformed login payloads with 400', async () => {
    expect(
      (await request(ctx.app).post('/api/auth/login').send({ email: 'login@example.com' })).status,
    ).toBe(400);
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/login')
          .send({ email: 'login@example.com', password: PASSWORD, role: 'ADMIN' })
      ).status,
    ).toBe(400);
  });

  it('rate-limits repeated attempts with 429 in the standard error envelope', async () => {
    const limited = await freshContext({ AUTH_RATE_LIMIT_MAX: '3' });
    const attempt = () =>
      request(limited.app)
        .post('/api/auth/login')
        .send({ email: 'x@example.com', password: 'Wrong-password-1' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    await limited.db.$disconnect();
  });
});

describe('access token authentication (GET /api/auth/me)', () => {
  it('returns the current user for a valid token', async () => {
    const { token } = await registerUser(ctx.app, 'me@example.com');
    const res = await request(ctx.app).get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'me@example.com', role: 'CUSTOMER' });
  });

  it.each([
    ['no header', {}],
    ['wrong scheme', { Authorization: 'Basic abc' }],
    ['garbage token', { Authorization: 'Bearer not.a.jwt' }],
    ['empty bearer', { Authorization: 'Bearer ' }],
  ])('rejects %s with 401', async (_name, headers) => {
    const res = await request(ctx.app).get('/api/auth/me').set(headers);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired token', async () => {
    const { user } = await registerUser(ctx.app, 'old@example.com');
    const longAgo = await signTokenAt(
      ctx.env,
      { userId: user.id, role: 'CUSTOMER' },
      new Date(Date.now() - 3_600_000),
    );
    expect((await request(ctx.app).get('/api/auth/me').set(bearer(longAgo))).status).toBe(401);
  });

  it('rejects a token whose user no longer exists or has been disabled (immediate revocation)', async () => {
    const { token, user } = await registerUser(ctx.app, 'gone@example.com');
    await ctx.db.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    expect((await request(ctx.app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('reports the role stored in the database, not the one claimed in the token', async () => {
    const { user } = await registerUser(ctx.app, 'claim@example.com');
    const forged = await signTokenAt(ctx.env, { userId: user.id, role: 'ADMIN' }, new Date());
    const res = await request(ctx.app).get('/api/auth/me').set(bearer(forged));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('CUSTOMER');
  });
});

describe('refresh token rotation and logout', () => {
  const ORIGIN = 'http://localhost:5173';

  it('issues a new access token and rotates the refresh cookie', async () => {
    const { res: registered } = await registerUser(ctx.app, 'rot@example.com');
    const first = cookieValue(extractRefreshCookie(registered)!);

    const res = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', first)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.email).toBe('rot@example.com');
    const second = cookieValue(extractRefreshCookie(res)!);
    expect(second).not.toBe(first);
  });

  it('stores only a hash of the refresh token', async () => {
    const { res } = await registerUser(ctx.app, 'hash@example.com');
    const raw = cookieValue(extractRefreshCookie(res)!).split('=')[1]!;
    const rows = await ctx.db.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(raw);
    expect(rows[0]!.tokenHash).toHaveLength(64);
  });

  it('detects replay of a rotated token and revokes the whole token family', async () => {
    const { res: registered } = await registerUser(ctx.app, 'replay@example.com');
    const stolen = cookieValue(extractRefreshCookie(registered)!);

    const legit = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', stolen)
      .set('Origin', ORIGIN);
    const newest = cookieValue(extractRefreshCookie(legit)!);

    const replay = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', stolen)
      .set('Origin', ORIGIN);
    expect(replay.status).toBe(401);

    // The legitimate descendant is revoked too: the attacker and the user both must log in again.
    const afterReplay = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', newest)
      .set('Origin', ORIGIN);
    expect(afterReplay.status).toBe(401);
  });

  it('rejects a missing, unknown or expired refresh token', async () => {
    expect((await request(ctx.app).post('/api/auth/refresh').set('Origin', ORIGIN)).status).toBe(
      401,
    );
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/refresh')
          .set('Cookie', 'refresh_token=nope')
          .set('Origin', ORIGIN)
      ).status,
    ).toBe(401);

    const { res } = await registerUser(ctx.app, 'exp@example.com');
    await ctx.db.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieValue(extractRefreshCookie(res)!))
      .set('Origin', ORIGIN);
    expect(expired.status).toBe(401);
  });

  it('refuses cookie-authenticated requests from a foreign origin (CSRF defence)', async () => {
    const { res } = await registerUser(ctx.app, 'csrf@example.com');
    const cookie = cookieValue(extractRefreshCookie(res)!);
    const evil = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
    const crossSite = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'cross-site');
    expect(crossSite.status).toBe(403);
  });

  it('refuses to refresh for a user who has since been disabled', async () => {
    const { res, user } = await registerUser(ctx.app, 'dis@example.com');
    await ctx.db.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    const refreshed = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieValue(extractRefreshCookie(res)!))
      .set('Origin', ORIGIN);
    expect(refreshed.status).toBe(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const { res } = await registerUser(ctx.app, 'bye@example.com');
    const cookie = cookieValue(extractRefreshCookie(res)!);

    const out = await request(ctx.app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    expect(out.status).toBe(204);
    expect(extractRefreshCookie(out)).toMatch(/refresh_token=;/);

    const again = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    expect(again.status).toBe(401);
  });

  it('logout without a cookie is harmless', async () => {
    expect((await request(ctx.app).post('/api/auth/logout').set('Origin', ORIGIN)).status).toBe(
      204,
    );
  });
});

describe('HTTP hardening and error format', () => {
  it('sets security headers and hides the framework', async () => {
    const res = await request(ctx.app).get('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('echoes a safe X-Request-Id and generates one otherwise', async () => {
    const given = await request(ctx.app)
      .get('/health/live')
      .set('X-Request-Id', 'client-req-12345');
    expect(given.headers['x-request-id']).toBe('client-req-12345');
    const unsafe = await request(ctx.app)
      .get('/health/live')
      .set('X-Request-Id', 'bad id with spaces\t');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with a JSON 404 envelope that includes the request id', async () => {
    const res = await request(ctx.app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns 400 for malformed JSON and 413 for oversized bodies, without leaking internals', async () => {
    const bad = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const big = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: 'x'.repeat(20_000) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(JSON.stringify(bad.body)).not.toMatch(/SyntaxError|at \w+ \(|node_modules/);
  });

  it('allows CORS only for configured origins', async () => {
    const ok = await request(ctx.app).get('/health/live').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(ctx.app).get('/health/live').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
