// R7-31 developer tools in the browser: reached from Settings → Advanced (only when the server
// runs with --dev-tools, as this test server does), diagnostics with the connections' clock sync,
// the simulated fairness test, and the JSON report export (no secrets).
import fs from 'node:fs';
import { test, expect, chromium, type Browser } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterAll(async () => {
  await cr?.close();
});

test('developer tools: diagnostics, fairness test, exported report', async () => {
  const ctx = await cr.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const pc = await ctx.newPage();
  await pc.goto(`${BASE}/host/settings`);
  await pc.getByTestId('settings-tab-advanced').click(); // R17-14: Settings → Advanced
  await pc.getByTestId('devtools-link').click();
  await expect(pc).toHaveURL(/\/host\/dev$/);
  await expect(pc.getByTestId('devtools')).toBeVisible();
  // Diagnostics: this browser's own connections are listed with their kind.
  await expect(pc.getByTestId('devtools-loop')).toContainText('p99');
  await expect(pc.getByTestId('devtools-connections').locator('tbody tr').first()).toBeVisible();

  // Fairness test: 3 phones (one added), fair timing beats arrival order on callable clues.
  await pc.getByTestId('devtools-add-phone').click();
  await expect(pc.getByTestId('devtools-phone')).toHaveCount(3);
  await pc.getByTestId('devtools-run').click();
  const result = pc.getByTestId('devtools-result');
  await expect(result).toContainText('Right winner');
  await expect(result.locator('tbody').nth(1).locator('tr')).toHaveCount(3);
  await pc.screenshot({ path: 'test-results/screens/r7e-devtools.png', fullPage: true });

  // Export: a JSON report with the diagnostics and the test, without the host token.
  const [download] = await Promise.all([pc.waitForEvent('download'), pc.getByTestId('devtools-export').click()]);
  expect(download.suggestedFilename()).toMatch(/^offlinejeopardy-diagnostics-.*\.json$/);
  const report = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
  expect(report.diagnostics.kind).toBe('OfflineJeopardy diagnostics');
  expect(report.fairnessTest.result.devices).toHaveLength(3);
  const token = await pc.evaluate(() => Object.values(localStorage).join(' '));
  for (const part of token.split(/\s+/).filter((t) => t.length > 20)) expect(JSON.stringify(report)).not.toContain(part);
  await ctx.close();
});
