import { defineConfig } from '@playwright/test';

export const E2E_PORT = 3210;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${E2E_PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx tsx src/server/cli.ts --data=test-results/e2e-data --port=${E2E_PORT} --fresh`,
    url: `http://127.0.0.1:${E2E_PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
