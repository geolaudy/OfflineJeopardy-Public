import { defineConfig } from '@playwright/test';

// README screenshots (tests/screenshots, `npm run screenshots`): a fresh server with its own data
// folder, separate from the e2e suite's.
process.env.E2E_PORT ??= '3290'; // read by tests/e2e/hostSocket.ts too
const PORT = Number(process.env.E2E_PORT);

export default defineConfig({
  testDir: 'tests/screenshots',
  timeout: 300_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, actionTimeout: 15_000 },
  webServer: {
    command: `npx tsx src/server/cli.ts --data=test-results/screenshot-data-${PORT} --bootstrap=test-results/screenshot-boot-${PORT}.json --port=${PORT} --fresh`,
    url: `http://127.0.0.1:${PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
