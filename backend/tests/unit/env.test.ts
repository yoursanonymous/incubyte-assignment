import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGINS: 'http://localhost:5173, https://app.example.com',
};

describe('loadEnv', () => {
  it('applies safe defaults and parses CORS origins into a trimmed list', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://app.example.com']);
    expect(env.ARGON2_MEMORY_KIB).toBe(19456);
    expect(env.ARGON2_TIME_COST).toBe(2);
  });

  it('refuses to start without a database URL', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects the published development secret in production', () => {
    expect(() =>
      loadEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-only-secret-change-me-dev-only-secret-change-me',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects wildcard CORS origins', () => {
    expect(() => loadEnv({ ...valid, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects non-numeric ports', () => {
    expect(() => loadEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('does not echo secret values in the error message', () => {
    try {
      loadEnv({ ...valid, JWT_SECRET: 'short-secret-value' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('short-secret-value');
    }
  });
});
