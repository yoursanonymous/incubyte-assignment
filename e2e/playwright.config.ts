import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 4173;
const backendEnv = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
  DATABASE_URL: 'postgresql://dealership:dealership_dev_pw@localhost:5432/dealership_e2e',
  JWT_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-secret',
  CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
  ARGON2_MEMORY_KIB: '1024',
  ARGON2_TIME_COST: '1',
  AUTH_RATE_LIMIT_MAX: '1000',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../reports/e2e-results.json' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Reset the e2e database, then start the real API against it.
      command: 'npx tsx scripts/e2e-prepare.ts && npx tsx src/server.ts',
      cwd: '../backend',
      env: backendEnv,
      url: `http://localhost:${API_PORT}/health/ready`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      // The production build served by `vite preview`, proxying /api to the real API.
      command: `npx vite preview --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
