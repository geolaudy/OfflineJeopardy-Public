// Round 13 — the host's live screen: one frame for the embedded view and full screen, the TV preview
// as wide as the screen allows, the TV's own animations in the preview (R13-1 … R13-8, R13-13) —
// and the lobby: the TV's join section, the iPad lobby and Buzzers tab without scrolling (R13-9 … R13-12).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
  await setup(); // leave no game or lobby behind for the next spec
});
test.afterAll(async () => {
  await cr?.close();
  await wk?.close();
});

async function setup() {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  return { api, host, H };
}

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'];

/** A solo game on the starter board with `n` players, at the board (or the introduction). */
async function startGame(n: number, _tag: string, opts: { intro?: boolean } = {}) {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 13 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  // One set of profiles for the whole spec (profile creation is rate-limited per address); every
  // third name is long.
  const existing = (await (await api.get('/api/profiles')).json()) as { id: string; name: string }[];
  for (let i = 0; i < n; i++) {
    const name = `Thirteen ${String.fromCharCode(65 + i)}${i % 3 === 2 ? ' with a long name' : ''}`;
    let id = existing.find((p) => p.name === name)?.id;
    if (!id) id = ((await (await api.post('/api/profiles', { data: { name, color: COLORS[i % 8], avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } }).profile.id;
    await h.act({ type: 'addPlayer', profileId: id });
  }
  await h.until((x) => x.competitors.length === n);
  await h.act({ type: 'startGame' });
  if (!opts.intro) await h.act({ type: 'introSkip' });
  return { api, H, h };
}

async function box(p: Page, id: string) {
  const b = await p.getByTestId(id).boundingBox();
  expect(b, id).not.toBeNull();
  return b!;
}

for (const [label, dev] of [
  ['ipad-land', 'iPad Pro 11 landscape'],
  ['ipad-port', 'iPad Pro 11'],
  ['iphone-land', 'iPhone 13 landscape'],
] as const)
  test(`screens: one frame embedded and full screen (${label})`, async () => {
    test.setTimeout(150_000);
    const { h } = await startGame(3, `R13${label}`);
    const page = await (await wk.newContext({ ...devices[dev] })).newPage();
    const shot = (name: string) => page.screenshot({ path: `test-results/screens/r13-${label}-${name}.png` });
    await page.goto(`${BASE}/host`);
    await expect(page.getByTestId('host-tile')).toHaveCount(30);
    await page.waitForTimeout(1200);
    await shot('embedded-board');
    const toggleEmb = await box(page, 'fullscreen-toggle');
    await page.getByTestId('fullscreen-toggle').click();
    await page.waitForTimeout(500);
    await shot('fs-board');
    if (label === 'ipad-land') {
      // R13-1: full screen on an iPad in landscape — the TV picture reaches both screen edges.
      const stage = await box(page, 'game-stage');
      expect(stage.x).toBeLessThanOrEqual(0.5);
      expect(stage.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
    }
    await h.act({ type: 'selectClue', clueId: 'geo_2' });
    await expect(page.getByTestId('clue-preview-box')).toBeVisible();
    await page.waitForTimeout(1500);
    await shot('fs-clue');
    await page.getByTestId('unlock').click();
    await h.act({ type: 'timerStart', kind: 'buzz', seconds: 30 });
    await page.waitForTimeout(600);
    await shot('fs-clue-timer');
    await page.getByTestId('fullscreen-toggle').click();
    await page.waitForTimeout(500);
    await shot('embedded-clue-timer');
    // The Fullscreen / minimise button is in the same place relative to the frame in both views.
    const toggleAfter = await box(page, 'fullscreen-toggle');
    expect(Math.abs(toggleAfter.x - toggleEmb.x)).toBeLessThan(2);
    h.close();
  });

for (const n of [2, 6, 10, 12]) // R14-1: 12 players at most
  test(`score cards: ${n} players fit under the band, centred, clear of Undo, nothing scrolls (R13-5)`, async () => {
    test.setTimeout(120_000);
    const { h } = await startGame(n, `R13n${n}`);
    for (const fullscreen of [false, true]) {
      const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
      await page.goto(`${BASE}/host`);
      await expect(page.getByTestId('host-score')).toHaveCount(n);
      if (fullscreen) await page.getByTestId('fullscreen-toggle').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/screens/r13-cards-${n}-${fullscreen ? 'fs' : 'embedded'}.png` });
      const scores = await box(page, 'host-scores');
      const undo = await box(page, 'undo');
      const bar = await box(page, 'game-bar');
      expect(scores.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      const cards = await page.getByTestId('host-score').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
      for (const c of cards) {
        expect(c.y).toBeGreaterThanOrEqual(scores.y - 1);
        expect(c.y + c.height).toBeLessThanOrEqual(scores.y + scores.height + 1);
        expect(c.x + c.width).toBeLessThanOrEqual(undo.x + 1); // never under Undo
        expect(c.width).toBeGreaterThan(100); // names stay readable
      }
      // Centred as a group (between the two Undo-wide columns).
      const left = Math.min(...cards.map((c) => c.x));
      const right = Math.max(...cards.map((c) => c.x + c.width));
      expect(Math.abs(left - scores.x - (scores.x + scores.width - right))).toBeLessThan(scores.width * 0.25);
      // Nothing on the page scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.context().close();
    }
    h.close();
  });

test('introduction: categories in the header, no repeated progress text, the board fills in and clues zoom out of their tile in the preview (R13-7, R13-13)', async () => {
  test.setTimeout(150_000);
  const { h } = await startGame(3, 'R13intro', { intro: true });
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${BASE}/host`);
  const head = page.getByTestId('game-strip');
  await expect(head.getByTestId('intro-cat')).toHaveCount(6);
  await expect(head).toContainText(/Introduce the categories/i);
  await expect(page.getByTestId('intro-now')).not.toContainText(/Category \d of/);
  await expect(page.getByTestId('host-tile')).toHaveCount(0);
  await head.getByTestId('intro-cat').nth(2).click();
  await expect(head.getByTestId('intro-cat').nth(2)).toHaveAttribute('aria-current', 'step');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/screens/r13-intro-embedded.png' });
  await page.getByTestId('fullscreen-toggle').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screens/r13-intro-fs.png' });
  // The preview is one TV page for the whole game: mark it, and check the mark survives every change.
  const frame = page.frameLocator('[data-testid="game-stage"] iframe');
  await frame.locator('body').evaluate(() => ((window as unknown as { ojMark: number }).ojMark = 42));
  const mark = () => frame.locator('body').evaluate(() => (window as unknown as { ojMark?: number }).ojMark ?? null);

  // Skip → the board appears and fills in, as on the TV.
  await page.getByTestId('intro-skip').click();
  await expect(page.getByTestId('host-tile')).toHaveCount(30);
  const board = page.frameLocator('[data-testid="board-preview"] iframe');
  expect(await board.locator('.bt-fill').count()).toBe(30);
  expect(await mark()).toBe(42);

  // A clue zooms out of its tile (a transform animation on the TV's clue panel).
  await page.getByLabel('Geography for 400', { exact: true }).click();
  const opened = await h.until((g) => g.phase === 'clue');
  const clue = page.frameLocator('[data-testid="clue-preview"] iframe');
  await expect(clue.getByTestId('tv-clue-panel')).toBeVisible();
  const anims = await clue.getByTestId('tv-clue-panel').evaluate((el) => el.getAnimations().map((a) => JSON.stringify((a.effect as KeyframeEffect).getKeyframes()[0]?.transform ?? '')));
  expect(anims.some((t) => t.includes('scale'))).toBe(true);
  expect(await mark()).toBe(42);
  // Full screen off and on: still the same page, no restart.
  await page.getByTestId('fullscreen-toggle').click();
  await page.getByTestId('fullscreen-toggle').click();
  expect(await mark()).toBe(42);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screens/r13-clue-fs.png' });
  // Back to the board: the clue shrinks into its tile; the board does not fill in again.
  await h.act({ type: 'closeClue', clueId: opened.clue.clueId });
  await expect(page.getByTestId('host-tile')).toHaveCount(30);
  expect(await mark()).toBe(42);
  h.close();
});

test('a preview opened mid-game does not replay the board fill-in (R13-13)', async () => {
  test.setTimeout(90_000);
  const { h } = await startGame(2, 'R13late');
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${BASE}/host`);
  await expect(page.getByTestId('host-tile')).toHaveCount(30);
  const board = page.frameLocator('[data-testid="board-preview"] iframe');
  await expect(board.getByTestId('board-tile').first()).toBeVisible();
  expect(await board.locator('.bt-fill').count()).toBe(0);
  h.close();
});

/** The game computer's input bridge (as the Electron TV window): simulated controllers. */
async function bridgeSocket(token: string) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.send(JSON.stringify({ t: 'hello', role: 'public', token }));
  await new Promise((r) => setTimeout(r, 200));
  return {
    connect: (i: number) => ws.send(JSON.stringify({ t: 'controller', ev: { type: 'connected', controllerId: `joycon:${i % 2 ? 'R' : 'L'}:r13-${i}`, kind: 'joycon', label: `Joy-Con (${i % 2 ? 'R' : 'L'}) #${i + 1}`, side: i % 2 ? 'R' : 'L' } })),
    press: (i: number) => {
      for (const pressed of [true, false])
        ws.send(JSON.stringify({ t: 'controller', ev: { type: 'button', controllerId: `joycon:${i % 2 ? 'R' : 'L'}:r13-${i}`, kind: 'joycon', side: i % 2 ? 'R' : 'L', button: i % 2 ? 'A' : 'Right', pressed } }));
    },
    close: () => ws.close(),
  };
}

/** A lobby (not started) with `n` players and `pads` simulated Joy-Cons. */
async function openLobby(n: number, pads: number) {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 13 lobby' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const existing = (await (await api.get('/api/profiles')).json()) as { id: string; name: string }[];
  for (let i = 0; i < n; i++) {
    const name = `Thirteen ${String.fromCharCode(65 + i)}${i % 3 === 2 ? ' with a long name' : ''}`;
    let id = existing.find((p) => p.name === name)?.id;
    if (!id) id = ((await (await api.post('/api/profiles', { data: { name, color: COLORS[i % 8], avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } }).profile.id;
    await h.act({ type: 'addPlayer', profileId: id });
  }
  await h.until((x) => x.competitors.length === n);
  const bridge = await bridgeSocket(host);
  for (let i = 0; i < pads; i++) bridge.connect(i);
  return { api, H, h, bridge };
}

/** What scrolls on the lobby page (the page and both columns), with the overflow in px: [] when it all fits. */
const lobbyOverflow = (p: Page) =>
  p.evaluate(() =>
    [document.querySelector<HTMLElement>('[data-testid="host-main"]'), ...document.querySelectorAll<HTMLElement>('[data-testid="lobby-manage"] .scroll-area')]
      .filter((el): el is HTMLElement => !!el && el.scrollHeight > el.clientHeight + 1)
      .map((el) => `${el.dataset.testid ?? 'column'} +${el.scrollHeight - el.clientHeight}px`),
  );

for (const [n, pads] of [
  [2, 0],
  [6, 2],
  [10, 6],
  [12, 12], // R14-1: 12 players at most
] as const)
  test(`lobby on the iPad (landscape): ${n} players and ${pads} controllers without scrolling (R13-10, R13-11, R13-12)`, async () => {
    test.setTimeout(120_000);
    const { h, bridge } = await openLobby(n, pads);
    const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
    await page.goto(`${BASE}/host`);
    await expect(page.getByTestId('setup-player')).toHaveCount(n);
    await expect(page.getByTestId('controller-chip')).toHaveCount(pads);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/screens/r13-lobby-${n}-${pads}.png` });
    // Players, controllers, Wi-Fi, More options and Start game are all on screen.
    for (const id of ['start-game', 'wifi-share', 'lobby-more', 'controller-chips', 'customize-rules']) await expect(page.getByTestId(id)).toBeInViewport();
    expect(await lobbyOverflow(page)).toEqual([]);
    // The Buzzers tab: the buzzer check, every controller and every player's buzzer.
    await page.getByRole('tab', { name: 'Buzzers' }).click();
    await expect(page.getByTestId('controller-row')).toHaveCount(pads);
    await expect(page.getByTestId('assignment-row')).toHaveCount(n);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/screens/r13-buzzers-${n}-${pads}.png` });
    expect(await lobbyOverflow(page)).toEqual([]);
    if (pads) {
      // With the results of a buzzer check in which every controller pressed, it still fits.
      await page.getByTestId('buzz-check-start').click();
      await expect(page.getByTestId('buzz-check-stop')).toBeVisible();
      for (let i = 0; i < pads; i++) bridge.press(i);
      await expect(page.getByTestId('buzz-check-presses').locator('li')).toHaveCount(pads);
      await page.getByTestId('buzz-check-stop').click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/screens/r13-buzzers-${n}-${pads}-check.png` });
      expect(await lobbyOverflow(page)).toEqual([]);
    }
    bridge.close();
    h.close();
  });

test('TV lobby: Wi-Fi labelled under the steps, the join address centred under the QR code and no wider (R13-9)', async () => {
  test.setTimeout(90_000);
  const { api, H, h, bridge } = await openLobby(2, 0);
  bridge.close();
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const url = tv.getByTestId('tv-join-url');
  await expect(url).toContainText('/join');
  const qr = (await tv.getByTestId('tv-join-card').boundingBox())!;
  const u = (await url.boundingBox())!;
  expect(u.y).toBeGreaterThan(qr.y + qr.height);
  const text = await url.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().toJSON() as DOMRect;
  });
  expect(text.x).toBeGreaterThanOrEqual(qr.x - 1);
  expect(text.x + text.width).toBeLessThanOrEqual(qr.x + qr.width + 1);
  expect(Math.abs(text.x + text.width / 2 - (qr.x + qr.width / 2))).toBeLessThan(3);
  // A long network name and password, shared by the host.
  const ssid = 'Extremely Long Family Network 5G'; // 32 characters, the most an SSID has
  await api.put('/api/host/wifi', { headers: H, data: { show: true, manualSsid: ssid, manualPassword: 'correct-horse-battery-staple-2026', showPassword: true } });
  await expect(tv.getByTestId('tv-wifi-ssid')).toHaveText(ssid);
  await expect(tv.getByTestId('tv-wifi')).toContainText('Network:');
  await expect(tv.getByTestId('tv-wifi-password')).toHaveText('correct-horse-battery-staple-2026');
  await expect(tv.getByTestId('tv-wifi')).toContainText('Password:');
  const side = (await tv.getByTestId('tv-lobby-side').boundingBox())!;
  const wifi = (await tv.getByTestId('tv-wifi').boundingBox())!;
  expect(wifi.x + wifi.width).toBeLessThanOrEqual(side.x + side.width + 1);
  await tv.screenshot({ path: 'test-results/screens/r13-tv-lobby-wifi.png' });
  // Hidden again: nothing about the network on the TV.
  await api.put('/api/host/wifi', { headers: H, data: { show: false } });
  await expect(tv.getByTestId('tv-wifi')).toHaveCount(0);
  h.close();
});

test('the Buzzers page from the navigation fits 12 players and 15 controllers on the iPad (R13-12)', async () => {
  test.setTimeout(120_000);
  const { h, bridge } = await openLobby(12, 15);
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${BASE}/host/buzzers`);
  await expect(page.getByTestId('controller-row')).toHaveCount(15);
  await expect(page.getByTestId('assignment-row')).toHaveCount(12);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screens/r13-buzzers-page-15.png' });
  const fits = await page.evaluate(() => {
    const main = document.querySelector('[data-testid="host-main"]')!;
    return main.scrollHeight <= main.clientHeight + 1;
  });
  expect(fits).toBe(true);
  bridge.close();
  h.close();
});
