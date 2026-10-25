import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/support/test-env.js';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          env: testEnv,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          env: testEnv,
          globalSetup: ['tests/support/global-setup.ts'],
          // Integration files share one database, so they run one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
});
