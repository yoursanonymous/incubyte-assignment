import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openApiDocument } from '../../src/openapi/spec.js';
import { freshContext, type TestContext } from '../support/app.js';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await freshContext();
});
afterAll(async () => {
  await ctx?.db.$disconnect();
});

const UUID = '00000000-0000-4000-8000-000000000000';
const operations = Object.entries(openApiDocument.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({
    method,
    path,
    op: op as { security?: unknown[] },
  })),
);

describe('OpenAPI document matches the running application', () => {
  it('documents every endpoint required by the assignment', () => {
    const documented = operations.map((o) => `${o.method.toUpperCase()} ${o.path}`);
    for (const required of [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/vehicles',
      'GET /api/vehicles',
      'GET /api/vehicles/search',
      'PUT /api/vehicles/{id}',
      'DELETE /api/vehicles/{id}',
      'POST /api/vehicles/{id}/purchase',
      'POST /api/vehicles/{id}/restock',
    ])
      expect(documented).toContain(required);
  });

  it.each(operations.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o] as const))(
    '%s exists and enforces its declared auth',
    async (_label, { method, path, op }) => {
      const res = await (
        request(ctx.app) as unknown as Record<string, (p: string) => request.Test>
      )[method]!(path.replace('{id}', UUID));
      const isMissingRoute = res.status === 404 && res.body?.error?.message === 'Route not found.';
      expect(isMissingRoute, 'route is documented but not implemented').toBe(false);
      if (op.security?.length) expect(res.status).toBe(401);
    },
  );

  it('serves the same document at /api/docs/openapi.json', async () => {
    const res = await request(ctx.app).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(Object.keys(res.body.paths)).toEqual(Object.keys(openApiDocument.paths));
  });
});
