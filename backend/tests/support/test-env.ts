/** Environment shared by every test project. Never points at a non-test database. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://dealership:dealership_dev_pw@localhost:5432/dealership_test';

export const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
  DATABASE_URL: TEST_DATABASE_URL,
  DB_POOL_MAX: '20',
  JWT_SECRET: 'test-only-secret-test-only-secret-test-only-secret',
  JWT_ISSUER: 'dealership-api',
  JWT_AUDIENCE: 'dealership-web',
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '7',
  CORS_ORIGINS: 'http://localhost:5173',
  // Cheap hashing keeps the suite fast; production defaults live in env.ts.
  ARGON2_MEMORY_KIB: '1024',
  ARGON2_TIME_COST: '1',
  // Generous by default so ordinary tests never trip it; the rate-limit test lowers it explicitly.
  AUTH_RATE_LIMIT_MAX: '1000',
};
