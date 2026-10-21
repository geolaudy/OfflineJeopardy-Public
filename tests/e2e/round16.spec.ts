// Round 16 — the owner's real-hardware check of 0.17.0-rc.2: text fields stay above the on-screen
// keyboard everywhere (R16-4 … R16-6: the phone's nickname sheet, the iPad lobby's Wi-Fi form with
// its column scrolled to the top or not, a dialog's field), with one keyboard tracker that does not
// trust window.innerHeight (WebKit can report the visible height there).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r16-${name}.png` });
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
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

async function openLobby() {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 16 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  return { api, host, H, h };
}

/**
 * Stands in for the on-screen keyboard as real WebKit may report it: the visual viewport shrinks
 * and window.innerHeight follows it (so innerHeight cannot tell a keyboard from no keyboard).
 * Safari also scrolls the document towards the field — simulated with `pan` (visual viewport moved
 * down within the layout viewport).
 */
async function fakeKeyboard(p: Page) {
  await p.addInitScript(() => {
    const vv = new EventTarget();
    const full = () => document.documentElement.clientHeight;
    let kb = 0;
    let pan = 0;
    for (const [k, get] of Object.entries<() => number>({ height: () => full() - kb, width: () => document.documentElement.clientWidth, offsetTop: () => pan, offsetLeft: () => 0, pageTop: () => window.scrollY + pan, pageLeft: () => 0, scale: () => 1 })) Object.defineProperty(vv, k, { get });
    Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: () => full() - kb, configurable: true });
    (window as unknown as { __kb: (h: number, pan?: number) => void }).__kb = (h: number, p = 0) => {
      kb = h;
      pan = p;
      vv.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    };
  });
}
const keyboard = (p: Page, h: number, pan = 0) => p.evaluate(([x, y]) => (window as unknown as { __kb: (h: number, pan?: number) => void }).__kb(x, y), [h, pan]);
/** The visible area (screen coordinates) between the top of the screen and the keyboard. */
async function visibleArea(p: Page, kbH: number, pan = 0) {
  const full = await p.evaluate(() => document.documentElement.clientHeight);
  return { top: pan, bottom: pan + full - kbH };
}
async function expectVisible(p: Page, id: string, area: { top: number; bottom: number }) {
  await expect
    .poll(async () => {
      const b = await p.getByTestId(id).boundingBox();
      return b ? b.y >= area.top - 1 && b.y + b.height <= area.bottom + 1 : false;
    }, { message: `${id} between ${area.top} and ${area.bottom}` })
    .toBe(true);
}

for (const [label, device, kbH, browser] of [
  ['iPhone portrait', devices['iPhone 13'], 336, 'wk'],
  ['iPhone landscape', devices['iPhone 13 landscape'], 200, 'wk'],
  ['iPad portrait', devices['iPad Pro 11'], 400, 'wk'],
  ['iPad landscape', devices['iPad Pro 11 landscape'], 420, 'wk'],
  ['Android portrait', devices['Pixel 7'], 300, 'cr'],
] as const) {
  test(`phone nickname sheet above the keyboard when innerHeight follows it: ${label} (R16-4)`, async () => {
    const { api } = await openLobby();
    const me = (await (await api.post('/api/profiles', { data: { name: `Keys16 ${label}`, color: '#16a34a', avatar: 'owl', pin: '1357' } })).json()) as { token: string };
    const p = await (await (browser === 'cr' ? cr : wk).newContext({ ...device })).newPage();
    await fakeKeyboard(p);
    await p.addInitScript((t) => localStorage.setItem('oj.profileToken', t), me.token);
    await p.goto(`${BASE}/join`);
    await p.getByTestId('join-game').click();
    await expect(p.getByTestId('lobby-joined')).toBeVisible();
    // Open and close it a few times, with and without Safari's own scroll towards the field.
    for (const pan of [0, 120, 0]) {
      await p.getByTestId('nickname-open').click();
      await p.getByTestId('nickname-input').click();
      await keyboard(p, kbH, pan);
      await expect(p.locator('html')).toHaveAttribute('data-keyboard', 'open');
      const area = await visibleArea(p, kbH, pan);
      for (const id of ['nickname-input', 'nickname-save', 'nickname-cancel']) await expectVisible(p, id, area);
      await p.getByTestId('nickname-input').fill('Long nickname number 16!');
      await expect(p.getByTestId('nickname-input')).toHaveValue('Long nickname number 16!');
      if (pan) await shot(p, `nickname-${label.replace(' ', '-')}`);
      await p.getByTestId('nickname-cancel').click();
      await keyboard(p, 0);
      await expect(p.locator('html')).not.toHaveAttribute('data-keyboard', 'open');
    }
  });
}

test('iPad landscape lobby: Wi-Fi name and password above the keyboard, column at the top or scrolled; the lobby comes back whole (R16-5)', async () => {
  await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await fakeKeyboard(ipad);
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('lobby-join')).toBeVisible();
  const wifi = ipad.getByTestId('wifi-share');
  if (!(await ipad.getByTestId('wifi-ssid').isVisible())) {
    if (!(await ipad.getByTestId('wifi-show').isChecked())) await ipad.getByTestId('wifi-show').check();
    if (!(await ipad.getByTestId('wifi-ssid').isVisible())) await wifi.locator('summary').click();
  }
  await expect(ipad.getByTestId('wifi-ssid')).toBeVisible();
  const column = ipad.getByTestId('lobby-join').locator('xpath=ancestor::div[contains(@class,"scroll-area")][1]');
  const shellBefore = await ipad.locator('.app-screen').first().boundingBox();
  const kbH = 420;
  for (const start of ['top', 'scrolled'] as const) {
    for (const id of ['wifi-ssid', 'wifi-password'] as const) {
      await column.evaluate((el, s) => (el.scrollTop = s === 'top' ? 0 : 60), start);
      await ipad.getByTestId(id).click();
      await keyboard(ipad, kbH);
      const area = await visibleArea(ipad, kbH);
      for (const v of [id, 'wifi-save']) await expectVisible(ipad, v, area);
      await ipad.getByTestId(id).pressSequentially('ab');
      await expect(ipad.getByTestId(id)).toHaveValue(/ab$/);
      if (id === 'wifi-ssid') await shot(ipad, `wifi-keyboard-${start}`);
      await ipad.getByTestId(id).blur();
      await keyboard(ipad, 0);
      await expect(ipad.locator('html')).not.toHaveAttribute('data-keyboard', 'open');
      // The lobby is whole again: the shell fills the screen as before, the QR code shows.
      await expect.poll(async () => (await ipad.locator('.app-screen').first().boundingBox())?.height).toBe(shellBefore!.height);
    }
  }
  await column.evaluate((el) => (el.scrollTop = 0));
  await expect(ipad.getByTestId('lobby-join').locator('img, svg, canvas').first()).toBeInViewport();
});

test('a field in a dialog over the host page stays above the keyboard; the page behind keeps its size (R16-6)', async () => {
  await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await fakeKeyboard(ipad);
  await ipad.goto(`${BASE}/host/players`);
  const add = ipad.getByRole('button', { name: /new player|add player|new profile/i }).first();
  await add.click();
  const field = ipad.getByRole('dialog').locator('input[type="text"], input:not([type])').first();
  await field.click();
  const shellBefore = await ipad.locator('.app-screen').first().boundingBox();
  await keyboard(ipad, 420);
  const area = await visibleArea(ipad, 420);
  await expect.poll(async () => { const b = await field.boundingBox(); return !!b && b.y >= area.top && b.y + b.height <= area.bottom; }).toBe(true);
  expect((await ipad.locator('.app-screen').first().boundingBox())!.height).toBe(shellBefore!.height);
  await field.fill('Typed above the keyboard');
  await expect(field).toHaveValue('Typed above the keyboard');
});
