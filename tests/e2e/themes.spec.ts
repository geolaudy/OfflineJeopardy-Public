// Theme editor (O5): live preview, save & use on TV (TV updates without reload), export/import.
import { test, expect, chromium, request, type Browser } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
// Close every page after each test: lingering WebKit contexts slow down later tests on Windows.
test.afterEach(async () => {
  for (const b of [cr]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
});

test('custom theme: live preview, use on TV (live update), edit, export and re-import', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };

  const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const tvRoot = tv.locator('.board-theme').first();
  await expect(tvRoot).toHaveAttribute('data-theme', 'classic');

  const desk = await (await cr.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  await desk.goto(`${BASE}/host/themes`);
  await desk.getByTestId('new-theme').click();
  const dialog = desk.getByRole('dialog');
  await dialog.getByLabel('Theme name').fill('E2E Party');
  await dialog.getByLabel('Clue tiles').fill('#7c3aed');
  await dialog.getByLabel('Value prefix').selectOption('€');

  // The live preview is the real TV page with sample data.
  const preview = desk.frameLocator('iframe[title="Live theme preview"]');
  await expect(preview.getByText('€200').first()).toBeVisible();
  await desk.screenshot({ path: 'test-results/screens/theme-editor.png' });
  await expect(preview.getByTestId('theme-preview-root')).toHaveAttribute('style', /--b-tile: #7c3aed/);
  await dialog.getByRole('tab', { name: 'Question' }).click();
  await expect(preview.getByTestId('clue-text')).toBeVisible();

  await dialog.getByTestId('save-use-theme').click();
  await expect(dialog).toHaveCount(0);
  await expect(desk.getByTestId('custom-theme-name')).toContainText(['E2E Party']);
  // The TV that was already open switches without a reload.
  await expect(tvRoot).toHaveAttribute('style', /--b-tile: #7c3aed/);
  await tv.screenshot({ path: 'test-results/screens/tv-custom-theme.png' });
  await desk.screenshot({ path: 'test-results/screens/themes-page.png' });

  // Edit → TV follows live.
  const themeCard = desk.locator('div', { has: desk.getByTestId('custom-theme-name').filter({ hasText: 'E2E Party' }) }).filter({ has: desk.getByRole('button', { name: 'Edit' }) }).last();
  await themeCard.getByRole('button', { name: 'Edit' }).click();
  await desk.getByRole('dialog').getByLabel('Clue tiles', { exact: true }).fill('#0f766e');
  await desk.getByRole('dialog').getByTestId('save-theme').click();
  await expect(tvRoot).toHaveAttribute('style', /--b-tile: #0f766e/);

  // Export, then import the file back as a second theme.
  const [download] = await Promise.all([desk.waitForEvent('download'), themeCard.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toBe('E2E Party.ojtheme.json');
  await desk.getByTestId('theme-import-input').setInputFiles((await download.path())!);
  await expect(desk.getByTestId('custom-theme-name').filter({ hasText: 'E2E Party' })).toHaveCount(2);

  // Back to the classic preset for any later test.
  await api.put('/api/settings', { headers: H, data: { boardTheme: 'classic' } });
  await expect(tvRoot).toHaveAttribute('data-theme', 'classic');
  await api.dispose();
});
