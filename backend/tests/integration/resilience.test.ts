import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createDb } from '../../src/infrastructure/db.js';
import { bearer, signTokenAt } from '../support/app.js';

// Points at a port nothing listens on, simulating a database outage.
const env = loadEnv({
  ...process.env,
  DATABASE_URL: 'postgresql://dealership:x@127.0.0.1:1/dealership_test',
  DB_CONNECTION_TIMEOUT_MS: '500',
});
const db = createDb(env);
const app = createApp({ env, db });
afterAll(() => db.$disconnect());

describe('database outage', () => {
  it('liveness stays green because the process is healthy', async () => {
    expect((await request(app).get('/health/live')).status).toBe(200);
  });

  it('readiness reports 503 without leaking infrastructure details', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });

  it('API calls fail with 503 SERVICE_UNAVAILABLE, not 500, and expose no internals', async () => {
    const token = await signTokenAt(
      env,
      { userId: '00000000-0000-4000-8000-000000000000', role: 'CUSTOMER' },
      new Date(),
    );
    const res = await request(app).get('/api/vehicles').set(bearer(token));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|prisma|postgres/i);
  });

  it('endpoints that do not need the database for validation still answer correctly', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nope' });
    expect(res.status).toBe(400);
  });
});
