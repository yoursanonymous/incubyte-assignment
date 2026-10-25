import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The proxy keeps the SPA and API on one origin in development, so the SameSite=Strict
  // refresh cookie works exactly as it will in production behind a single host.
  server: { port: 5173, proxy: { '/api': API_TARGET, '/health': API_TARGET } },
  preview: { port: 4173, proxy: { '/api': API_TARGET } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
