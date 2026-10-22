import { defineConfig } from '@playwright/test';

// Override with E2E_PORT to run several checkouts (git worktrees) side by side.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${E2E_PORT}`, trace: 'retain-on-failure' },
  webServer: {
    // --dev-tools: R7-31 developer tools (devtools.spec); normal servers leave them off.
    command: `npx tsx src/server/cli.ts --data=test-results/e2e-data-${E2E_PORT} --bootstrap=test-results/e2e-boot-${E2E_PORT}.json --port=${E2E_PORT} --fresh --dev-tools`,
    url: `http://127.0.0.1:${E2E_PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
