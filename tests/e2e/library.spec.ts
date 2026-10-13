// Desktop board library: package export/import with media (L9), duplicate, archive/restore,
// version restore (K5). Runs against the real local server in Chromium (Electron's engine).
import { test, expect, chromium, request, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
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

const card = (page: Page, title: string) =>
  page
    .locator('div', { has: page.getByRole('heading', { name: title, exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Edit', exact: true }) })
    .last();

test('preview a board and its clues without starting a game (R2-17)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const before = await (await api.get('/api/games', { headers: H })).json();
  const historyBefore = (await (await api.get('/api/history', { headers: H })).json()).length;

  const desk = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await desk.goto(`${BASE}/desk/library`);
  await card(desk, 'Starter Trivia Night').getByTestId('board-preview-button').click();
  await expect(desk.getByTestId('board-preview')).toBeVisible();
  await expect(desk.getByTestId('board-category').first()).toHaveText('History');
  await desk.locator('[data-clue-id="hist_1"]').click();
  await expect(desk.getByTestId('clue-text')).toContainText('Machu Picchu', { ignoreCase: true });
  await expect(desk.getByTestId('clue-answer')).toHaveCount(0);
  await desk.getByTestId('preview-reveal').click();
  await expect(desk.getByTestId('clue-answer')).toHaveText('The Inca');
  await desk.getByTestId('preview-back').click();
  await expect(desk.locator('[data-clue-id="hist_1"][data-testid="board-tile"]')).toHaveCount(0); // played in the preview only
  await desk.getByTestId('preview-exit').click();
  await expect(desk).toHaveURL(/\/desk\/library$/);

  // Nothing was created or changed.
  const after = await (await api.get('/api/games', { headers: H })).json();
  expect(after.current).toBeNull();
  expect(after.games.length).toBe(before.games.length);
  expect((await (await api.get('/api/history', { headers: H })).json()).length).toBe(historyBefore);
  await api.dispose();
});

test('import a clue dataset file through the "From link or dataset" dialog (R2-21)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const desk = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await desk.goto(`${BASE}/desk/library`);
  await desk.getByTestId('import-from-source').click();
  const dialog = desk.getByRole('dialog');
  await dialog.getByRole('tab', { name: /file/i }).click();
  await desk.locator('#import-source-file').setInputFiles('tests/fixtures/import/jeopardy-dataset.json');
  await expect(dialog.getByText('Shows (2)')).toBeVisible();
  await dialog.getByRole('checkbox', { name: /4680/ }).check();
  await dialog.getByRole('checkbox', { name: /2900/ }).uncheck();
  await expect(dialog.getByText('1 selected')).toBeVisible();
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(desk).toHaveURL(/\/desk\/boards\/[0-9a-f-]{36}$/);
  const id = desk.url().split('/').pop()!;
  const b = await (await api.get(`/api/boards/${id}`, { headers: { authorization: `Bearer ${host}` } })).json();
  expect(b.title).toBe('Show 4680 (2004-12-31)');
  expect(b.content.rounds.map((r: { kind: string }) => r.kind)).toEqual(['standard', 'standard', 'final']);
  await api.dispose();
});

test('board package with media: export from the library, import it back, plus duplicate / archive / version restore', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };

  // A board with an uploaded clue picture.
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffcc00' } }).png().toBuffer();
  const media = await (await api.post('/api/media', { headers: H, multipart: { file: { name: 'pic.png', mimeType: 'image/png', buffer: png } } })).json();
  const sampleId = (await (await api.get('/api/boards', { headers: H })).json())[0].id;
  const sample = await (await api.get(`/api/boards/${sampleId}`, { headers: H })).json();
  sample.content.rounds[0].categories[0].clues[0].media = [{ kind: 'image', url: media.url }];
  const made = await (await api.post('/api/boards', { headers: H, data: { title: 'Media Board', description: '', tags: ['pkg'], content: sample.content } })).json();
  expect(made.id).toBeTruthy();

  const desk = await (await cr.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })).newPage();
  await desk.goto(`${BASE}/desk/library`);
  const c = card(desk, 'Media Board');
  await c.getByRole('button', { name: /More/ }).click();
  const [download] = await Promise.all([desk.waitForEvent('download'), c.getByRole('button', { name: 'Export package (with media)' }).click()]);
  expect(download.suggestedFilename()).toBe('Media Board.ojboard.zip');
  const pkgPath = await download.path();
  const pkg = fs.readFileSync(pkgPath!);
  expect(pkg.readUInt32LE(0)).toBe(0x04034b50); // ZIP

  // Import it back through the import dialog under a new title.
  await desk.getByRole('button', { name: /^Import/ }).first().click();
  await desk.locator('#import-file').setInputFiles({ name: 'Media Board.ojboard.zip', mimeType: 'application/zip', buffer: pkg });
  await expect(desk.getByLabel('Board title')).toHaveValue('Media Board');
  await desk.getByLabel('Board title').fill('Media Board (imported)');
  await desk.getByRole('button', { name: 'Save and edit' }).click();
  await expect(desk).toHaveURL(/\/desk\/boards\/[0-9a-f-]{36}$/);
  const importedId = desk.url().split('/').pop()!;
  const imported = await (await api.get(`/api/boards/${importedId}`, { headers: H })).json();
  expect(imported.title).toBe('Media Board (imported)');
  const url = imported.content.rounds[0].categories[0].clues[0].media[0].url as string;
  expect(url).toMatch(/^\/media\/clues\//);
  expect(url).not.toBe(media.url);
  expect((await api.get(url)).status()).toBe(200);

  // Duplicate, archive and restore from the library.
  await desk.goto(`${BASE}/desk/library`);
  await card(desk, 'Media Board').getByRole('button', { name: /More/ }).click();
  await card(desk, 'Media Board').getByRole('button', { name: 'Duplicate' }).click();
  await expect(desk.getByRole('heading', { name: /^Media Board \(copy\)|^Copy of Media Board/ })).toBeVisible();
  await card(desk, 'Media Board').getByRole('button', { name: 'Archive' }).click();
  await expect(desk.getByRole('heading', { name: 'Media Board', exact: true })).toHaveCount(0);
  await desk.getByRole('checkbox', { name: /Show archived/ }).check();
  await card(desk, 'Media Board').getByRole('button', { name: /More/ }).click().catch(() => {});
  await card(desk, 'Media Board').getByRole('button', { name: 'Restore' }).click();
  const after = await (await api.get(`/api/boards/${made.id}`, { headers: H })).json();
  expect(after.archived).toBe(false);

  // Version history: change the title via the API (new version), restore the first version.
  await api.put(`/api/boards/${made.id}`, { headers: H, data: { ...after, title: 'Media Board v2', version: true } });
  const versions = await (await api.get(`/api/boards/${made.id}/versions`, { headers: H })).json();
  expect(versions.length).toBeGreaterThanOrEqual(2);
  const first = versions[versions.length - 1];
  await api.post(`/api/boards/${made.id}/versions/${first.id}/restore`, { headers: H });
  expect((await (await api.get(`/api/boards/${made.id}`, { headers: H })).json()).title).toBe('Media Board');
  await api.dispose();
});
