// Round 7 Milestone C (R7-2, R7-3, R7-4) on the TV at 16:9, 1280×720 and 4:3:
// - every menu page's heading is at the lobby heading's height and its content panel starts on
//   the lobby's content line, full width; the compact corner panel ends above that line (R7-2);
// - long names are never cut off and a nickname shows the profile name underneath (R7-3);
// - a connected phone's card shows its measured delay, a missing phone "not connected" (R7-4).
import { test, expect, chromium, request, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const SIZES = [
  { name: '1080p', width: 1920, height: 1080 },
  { name: '720p', width: 1280, height: 720 },
  { name: '4x3', width: 1440, height: 1080 },
];
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterEach(async () => {
  for (const c of cr?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
});

const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r7c-${name}.png` });
const box = async (p: Page, sel: string) => (await p.locator(sel).first().boundingBox())!;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

async function mkProfile(api: APIRequestContext, H: Record<string, string>, data: Record<string, string>): Promise<string> {
  const r = await api.post('/api/admin/profiles', { headers: H, data });
  expect(r.ok()).toBe(true);
  return (await r.json()).id;
}

/** A phone that answers the server's clock probes (like the player portal does). */
async function syncedPhone(token: string) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'sync') ws.send(JSON.stringify({ t: 'syncR', n: m.n, c: performance.now(), e: 0 }));
  });
  ws.send(JSON.stringify({ t: 'hello', role: 'player', token }));
  return ws;
}

test('menu headings at the lobby height, full-width content, stacked names, phone delay', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const long = 'Bartholomew Montgomery-Quigley'; // 30 characters, the longest a profile name can be
  const names = [long, 'Peggy Quigley', 'Jolly Gary', 'Yuki Pang', 'Ziggy Jones', 'Maggie Q'];
  const colors = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777'];
  const ids: string[] = [];
  for (let i = 0; i < names.length; i++) ids.push(await mkProfile(api, H, { name: names[i], color: colors[i], avatar: 'fox', pin: '1357' }));
  await api.post('/api/lobby', { headers: H, data: { name: 'R7 night' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const board = boards.find((b) => b.title === 'Starter Trivia Night')!;
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const id of ids) await h.act({ type: 'addPlayer', profileId: id });
  await h.act({ type: 'setNickname', profileId: ids[1], nickname: 'The Quizzinator Supreme' });
  await h.until((g) => g.competitors.length === ids.length && g.profiles[ids[1]]?.nickname);
  h.close();

  // Peggy's phone is open and answers the clock probes.
  const login = await api.post(`/api/profiles/${ids[1]}/login`, { data: { pin: '1357' } });
  expect(login.ok()).toBe(true);
  const phone = await syncedPhone((await login.json()).token);

  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token: host }));
  const present = (req: Record<string, unknown>) => ws.send(JSON.stringify({ t: 'present', req }));
  present({ page: 'lobby' });

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-lobby-player')).toHaveCount(names.length);

  // R7-3: nickname as the main name, the profile name underneath.
  const peggy = tv.getByTestId('tv-lobby-player').filter({ hasText: 'The Quizzinator Supreme' });
  await expect(peggy.getByTestId('tv-real-name')).toHaveText('Peggy Quigley');
  const [nickBox, realBox] = [await peggy.locator('.tvp-name-main').boundingBox(), await peggy.getByTestId('tv-real-name').boundingBox()];
  expect(realBox!.y).toBeGreaterThan(nickBox!.y + nickBox!.height * 0.5);
  // R7-4: a synced phone shows its delay; the others are not connected.
  await expect(peggy.getByTestId('tv-device')).toContainText(/Phone • (< 10|\d+) ms/, { timeout: 10_000 });
  const other = tv.getByTestId('tv-lobby-player').filter({ hasText: 'Jolly Gary' });
  await expect(other.getByTestId('tv-device')).toContainText('Phone • not connected');

  // Lobby reference lines at each size.
  const ref: Record<string, { head: number; panel: number }> = {};
  for (const s of SIZES) {
    await tv.setViewportSize(s);
    await tv.waitForTimeout(900);
    // R7-3: no name is cut off (each text block fits its card, names fit their width).
    for (const card of await tv.getByTestId('tv-lobby-player').all()) {
      // The block fits its card, and no line inside it is squeezed shorter than its own text.
      const fit = await card
        .locator('.tvp-person-fit')
        .evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1 && [...e.children].every((c) => c.scrollHeight <= c.clientHeight + 1 || getComputedStyle(c).overflow === 'visible'));
      expect(fit, `${s.name}: ${await card.innerText()}`).toBe(true);
      for (const n of await card.locator('.tvp-name-main, .tvp-name-real').all()) expect(await n.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    await expect(tv.getByTestId('tv-lobby-player').filter({ hasText: long })).toBeVisible();
    const head = await box(tv, '[data-testid=tv-lobby-board] .tvp-kicker');
    const panel = await box(tv, '.tvp-roster-panel');
    ref[s.name] = { head: head.y, panel: panel.y };
    await shot(tv, `lobby-${s.name}`);
  }

  const pages: [string, Record<string, unknown>][] = [
    ['players', { page: 'players' }],
    ['boards', { page: 'boards', boardId: board.id }],
    ['buzzers', { page: 'buzzers' }],
    ['leaderboard', { page: 'leaderboard', view: 'solo' }],
    ['rules', { page: 'rules' }],
  ];
  for (const [name, req] of pages) {
    present(req);
    await expect(tv.locator(`[data-testid=tv-present-page][data-page=${name}]`)).toBeVisible();
    for (const s of SIZES) {
      await tv.setViewportSize(s);
      await tv.waitForTimeout(900);
      const page = '[data-testid=tv-present-page]';
      // R7-2: the heading is where the lobby's is; the content panel starts on the lobby's line.
      const head = await box(tv, `${page} .tvp-kicker`);
      expect(Math.abs(head.y - ref[s.name].head)).toBeLessThanOrEqual(2);
      const content = await box(tv, `${page} .tvp-panel`);
      expect(Math.abs(content.y - ref[s.name].panel)).toBeLessThanOrEqual(2);
      // The compact panel ends above the content and never covers it; the content uses the width.
      const compact = await box(tv, '[data-testid=tv-lobby-compact]');
      expect(compact.y + compact.height).toBeLessThanOrEqual(content.y + 1);
      expect(overlaps(compact, content)).toBe(false);
      expect(content.x + content.width).toBeGreaterThan(compact.x + compact.width - 2);
      expect(await tv.locator('.tvp-compact-inner').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
      const qr = await box(tv, '[data-testid=tv-join-card]');
      expect(overlaps(qr, content)).toBe(false);
      expect(qr.y).toBeGreaterThanOrEqual(compact.y);
      await shot(tv, `${name}-${s.name}`);
    }
  }

  present({ page: 'lobby' });
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  phone.close();
  ws.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
