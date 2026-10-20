// Round 12 — the host full screen redesign (R12-3 … R12-8) and the round's other changes.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r12-${name}.png` });
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
  // Leave no game or lobby behind for the next spec.
  await setup();
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

/** A solo game on the starter board with `names` as players, at the board. */
async function startGame(names: string[], tag: string) {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 12 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const [i, name] of names.entries()) {
    const p = (await (await api.post('/api/profiles', { data: { name: `${name} ${tag}`, color: ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'][i % 8], avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
  }
  const g = await h.until((x) => x.competitors.length === names.length);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  return { api, H, h, ids: g.competitors.map((c: { id: string }) => c.id) as string[] };
}

for (const [label, dev] of [['ipad', 'iPad Pro 11 landscape'], ['iphone', 'iPhone 13 landscape']] as const)
test(`screens: host full screen board and clue (${label})`, async () => {
  test.setTimeout(150_000);
  const { h } = await startGame(['Twelve Ann', 'Twelve Bo', 'Twelve Cy'], 'scr');
  const ipad = await (await wk.newContext({ ...devices[dev] })).newPage();
  const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r12-${label}-${name}.png` });
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-board-box')).toBeVisible();
  await ipad.waitForTimeout(500);
  await shot(ipad, 'embedded-board');
  await ipad.getByTestId('fullscreen-toggle').click();
  await ipad.waitForTimeout(500);
  await shot(ipad, 'fs-board');
  await ipad.getByTestId('fs-menu-toggle').click();
  await ipad.waitForTimeout(400);
  await shot(ipad, 'fs-menu');
  await ipad.getByTestId('fs-menu-close').click();
  await h.act({ type: 'selectClue', clueId: 'geo_2' });
  await expect(ipad.getByTestId('clue-preview-box')).toBeVisible();
  await ipad.waitForTimeout(1500);
  await shot(ipad, 'fs-clue');
  await ipad.getByTestId('unlock').click();
  await h.act({ type: 'timerStart', kind: 'buzz', seconds: 30 });
  await ipad.waitForTimeout(800);
  await shot(ipad, 'fs-clue-timer');
  await ipad.getByTestId('fullscreen-toggle').click();
  await ipad.waitForTimeout(500);
  await shot(ipad, 'embedded-clue-timer');
  h.close();
});

test('guest joins from a phone, renames, tests the buzzer (yellow card on TV, host and phone); Wi-Fi details on the TV (R12-11, R12-12, R12-13)', async () => {
  test.setTimeout(150_000);
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Guest night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('lobby-manage')).toBeVisible();

  // The phone: Play as Guest → nickname → in the lobby without a profile or PIN.
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('play-as-guest').click();
  await expect(phone.getByTestId('guest-join')).toBeDisabled();
  await phone.getByTestId('guest-name').fill('Couch Potato');
  await phone.getByTestId('guest-join').click();
  await expect(phone.getByTestId('player-lobby')).toBeVisible();
  await phone.getByTestId('join-game').click();
  await expect(phone.getByTestId('lobby-joined')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-player').filter({ hasText: 'Couch Potato' })).toBeVisible();
  // Not in the profile list another phone sees.
  const profiles = (await (await api.get('/api/profiles')).json()) as { name: string }[];
  expect(profiles.some((p) => p.name === 'Couch Potato')).toBe(false);
  // The guest menu has no profile pages.
  await phone.getByRole('button', { name: /menu/i }).first().click();
  await expect(phone.getByTestId('nav-profile')).toHaveCount(0);
  await expect(phone.getByTestId('drawer-sign-out')).toHaveText(/Leave \(guest\)/);
  await phone.keyboard.press('Escape');

  // Rename in the lobby: every screen follows.
  await phone.getByTestId('nickname-open').click();
  await phone.getByTestId('nickname-input').fill('Sofa King');
  await phone.getByTestId('nickname-save').click();
  await expect(tv.getByTestId('tv-lobby-player').filter({ hasText: 'Sofa King' })).toBeVisible();
  await expect(ipad.getByTestId('setup-player').filter({ hasText: 'Sofa King' })).toBeVisible();

  // Test Buzzer: the phone confirms; the card glows on the TV, the host and the phone, then stops.
  await phone.getByTestId('test-buzzer-open').click();
  await expect(phone.getByTestId('test-buzzer-status')).toHaveText('Tap the buzzer');
  await phone.getByTestId('test-buzzer-button').dispatchEvent('pointerdown');
  await expect(phone.getByTestId('test-buzzer-status')).toHaveText(/glowing|Pressed 1 time/);
  const tvCard = tv.getByTestId('tv-lobby-player').filter({ hasText: 'Sofa King' });
  await expect(tvCard.getByTestId('lobby-glow')).toBeVisible();
  await expect(ipad.getByTestId('setup-player').filter({ hasText: 'Sofa King' }).getByTestId('lobby-glow')).toBeVisible();
  await shot(tv, 'tv-lobby-glow');
  await shot(phone, 'phone-test-buzzer');
  await expect(tvCard.getByTestId('lobby-glow')).toHaveCount(0, { timeout: 2500 }); // about a second
  // Nothing about the game changed.
  const g = await h.until(() => true);
  expect(g.phase).toBe('lobby');
  expect(g.competitors.every((c: { score: number }) => c.score === 0)).toBe(true);
  await phone.getByTestId('test-buzzer-done').click();
  await shot(ipad, 'ipad-lobby');

  // Wi-Fi details: off by default; the name, then (after revealing) the password on the TV.
  await expect(tv.getByTestId('tv-wifi')).toHaveCount(0);
  await ipad.getByTestId('wifi-show').check();
  await ipad.getByTestId('wifi-ssid').fill('Game Night WiFi');
  await ipad.getByTestId('wifi-password').fill('letmein-2026');
  await ipad.getByTestId('wifi-save').click();
  await expect(tv.getByTestId('tv-wifi-ssid')).toHaveText('Game Night WiFi');
  await expect(tv.getByTestId('tv-wifi-password')).toHaveCount(0);
  await ipad.getByTestId('wifi-show-password').check();
  await expect(tv.getByTestId('tv-wifi-password')).toHaveText('letmein-2026');
  await expect(ipad.getByTestId('wifi-password-shown')).toHaveText('••••••••');
  await ipad.getByTestId('wifi-reveal').click();
  await expect(ipad.getByTestId('wifi-password-shown')).toHaveText('letmein-2026');
  await shot(tv, 'tv-lobby-wifi');
  await ipad.getByTestId('wifi-show').uncheck();
  await expect(tv.getByTestId('tv-wifi')).toHaveCount(0);
  h.close();
});
