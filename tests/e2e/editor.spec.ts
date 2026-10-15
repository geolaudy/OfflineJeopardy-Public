// Board editor (K5): reorder categories by dragging the handle and with the arrow buttons; the
// new order is saved (existing boards autosave).
import { test, expect, chromium, request, type Browser } from '@playwright/test';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

const BASE = 'http://127.0.0.1:3210';
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterAll(async () => {
  await cr?.close();
});

test('categories reorder by drag and drop and by arrow buttons, and the order is saved', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  const content = structuredClone(SAMPLE_BOARD);
  content.rounds = [content.rounds[0]];
  content.rounds[0].categories = content.rounds[0].categories.slice(0, 3);
  const names = content.rounds[0].categories.map((c) => c.name);
  const b = (await (await api.post('/api/boards', { headers: H, data: { title: 'Drag Board', description: '', tags: [], content } })).json()) as { id: string };
  const saved = async () => ((await (await api.get(`/api/boards/${b.id}`, { headers: H })).json()).content.rounds[0].categories as { name: string }[]).map((c) => c.name);

  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/boards/${b.id}`);
  const handle = (n: number) => pc.locator('span[title="Drag to reorder"]').nth(n);
  await expect(handle(0)).toBeVisible();

  // Drag the first category onto the third.
  await handle(0).dragTo(pc.locator('span[title="Drag to reorder"]').nth(2));
  await expect.poll(saved, { timeout: 8000 }).toEqual([names[1], names[2], names[0]]);

  // Arrow buttons: move it back to the front.
  await pc.getByRole('button', { name: `Move ${names[0]} left` }).click();
  await pc.getByRole('button', { name: `Move ${names[0]} left` }).click();
  await expect.poll(saved, { timeout: 8000 }).toEqual(names);
  await expect(pc.getByRole('button', { name: `Move ${names[0]} left` })).toBeDisabled();

  await api.delete(`/api/boards/${b.id}`, { headers: H });
  await api.dispose();
});
