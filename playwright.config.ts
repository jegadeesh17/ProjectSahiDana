import { defineConfig } from '@playwright/test';

// Stub for M1: the E2E specs (tests/e2e/*.spec.ts) arrive with the live adapter.
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    env: { VITE_USE_MOCK_ADAPTER: 'true' },
  },
});
