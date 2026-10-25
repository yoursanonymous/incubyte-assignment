import request from 'supertest';
import { afterEach } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { createTokenService } from '../../src/modules/auth/tokens.js';
import type { Db } from '../../src/infrastructure/db.js';
import { createTestDb, resetDb } from './db.js';

export interface TestContext {
  app: Express;
  db: Db;
  env: Env;
}

// Every context owns a connection pool. Close them after each test so long files cannot
// exhaust PostgreSQL's max_connections.
const openClients: Db[] = [];
afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.$disconnect()));
});

/** Builds the real application against the isolated test database. */
export function buildTestContext(envOverrides: Partial<Record<string, string>> = {}): TestContext {
  const env = loadEnv({ ...process.env, ...envOverrides });
  const db = createTestDb();
  openClients.push(db);
  return { app: createApp({ env, db }), db, env };
}

export async function freshContext(
  envOverrides: Partial<Record<string, string>> = {},
): Promise<TestContext> {
  const ctx = buildTestContext(envOverrides);
  await resetDb(ctx.db);
  return ctx;
}

export const PASSWORD = 'Sup3r-secret-pass';

export async function registerUser(
  app: Express,
  email = 'customer@example.com',
  password = PASSWORD,
) {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    token: res.body.accessToken as string,
    user: res.body.user as { id: string; email: string; role: string },
    res,
  };
}

/** Registers a customer, promotes them directly in the database, and returns a fresh admin token. */
export async function createAdmin({ app, db }: TestContext, email = 'admin@example.com') {
  await registerUser(app, email);
  await db.user.update({ where: { email }, data: { role: 'ADMIN' } });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.accessToken as string, user: login.body.user as { id: string } };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Signs a token like the server would, but with a controllable clock (for expiry tests). */
export function signTokenAt(
  env: Env,
  claims: { userId: string; role: 'CUSTOMER' | 'ADMIN' },
  at: Date,
) {
  return createTokenService(
    {
      secret: env.JWT_SECRET,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    },
    () => at,
  ).signAccessToken(claims);
}

export function extractRefreshCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(
    (res.headers['set-cookie'] as string[] | string | undefined) ?? [],
  );
  return cookies.find((c) => c.startsWith('refresh_token='));
}
