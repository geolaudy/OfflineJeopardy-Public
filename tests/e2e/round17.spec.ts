// Round 17 — the owner's real-hardware check of 0.17.0-rc.3: the host types a Daily Double! wager in
// the band by default and starts the answer time (R17-1 … R17-3); fields and their Submit stay above
// the keyboard — the iPhone wager / answer forms (R17-6) and the iPad lobby's Wi-Fi fields even when
// WebKit scrolls their column back to the top after the keyboard has opened (R17-5).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r17-${name}.png` });
/** The owner's phone: iPhone 17 Pro (402 × 874 CSS px). */
const IPHONE_17_PRO = { ...devices['iPhone 13'], viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 3 };
const IPHONE_17_PRO_LAND = { ...devices['iPhone 13 landscape'], viewport: { width: 874, height: 402 }, screen: { width: 874, height: 402 }, deviceScaleFactor: 3 };
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
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 17 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  return { api, host, H, h };
}

/** The on-screen keyboard as WebKit may report it (see round16.spec): the visual viewport shrinks. */
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
async function visibleArea(p: Page, kbH: number, pan = 0) {
  const full = await p.evaluate(() => document.documentElement.clientHeight);
  return { top: pan, bottom: pan + full - kbH };
}
async function expectVisible(p: Page, id: string, area: { top: number; bottom: number }) {
  await expect
    .poll(
      async () => {
        const b = await p.getByTestId(id).boundingBox();
        return b ? b.y >= area.top - 1 && b.y + b.height <= area.bottom + 1 : false;
      },
      { message: `${id} between ${area.top} and ${area.bottom}` },
    )
    .toBe(true);
}

type Clue = { id: string; dailyWager?: boolean; used: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dailyDoubleOf = (g: any): Clue => g.rounds[g.roundIndex].categories.flatMap((c: { clues: Clue[] }) => c.clues).find((q: Clue) => q.dailyWager && !q.used);

/** A started game with one player on a phone (the given device). */
async function phoneGame(device: Parameters<Browser['newContext']>[0] = devices['iPhone 13'], kb = false) {
  const r = await openLobby();
  const res = await r.api.post('/api/profiles', { data: { name: `Seventeen ${Date.now() % 100000}`, color: '#16a34a', avatar: 'owl', pin: '1357' } });
  const token = ((await res.json()) as { token: string }).token;
  const phone = await (await wk.newContext(device)).newPage();
  if (kb) await fakeKeyboard(phone);
  await phone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), token);
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('join-game').click();
  await expect(phone.getByTestId('lobby-joined')).toBeVisible();
  await r.h.until((x) => x.competitors.length === 1);
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  const g = await r.h.until((x) => x.phase === 'board');
  return { ...r, phone, g };
}

// ---------- Milestone A: Daily Double! ----------

test('Daily Double! by default: the host types the wager in the band, locks it, the clue shows with the time stopped, Start Timer starts it (R17-1, R17-2)', async () => {
  test.setTimeout(150_000);
  const { h, phone, g } = await phoneGame();
  expect(g.rules.dailyWagerEntry).toBe('host');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  const stageBefore = await ipad.getByTestId('game-stage').boundingBox();
  await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
  await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
  let s = await h.until((x) => x.clue?.stage === 'wager');
  expect(s.timer).toBeNull();
  expect(s.clue.wagerEntry).toBe('host');
  // The band: the wager field (no Unlock Wager), Lock Wager & Show Clue waits for a wager.
  await expect(ipad.getByTestId('host-dd-input')).toBeVisible();
  await expect(ipad.getByTestId('host-dd-unlock')).toHaveCount(0);
  await expect(ipad.getByTestId('host-dd-lock')).toBeDisabled();
  await expect(ipad.getByTestId('host-dd-wager')).toContainText(/enter their wager/i);
  await expect(phone.getByTestId('phone-dd-host')).toBeVisible();
  await expect(phone.getByTestId('phone-dd-input')).toHaveCount(0);
  // The field sits in the band: the TV picture keeps its size, the score cards stay below the band.
  expect(await ipad.getByTestId('game-stage').boundingBox()).toEqual(stageBefore);
  const band = (await ipad.getByTestId('game-bar').boundingBox())!;
  const field = (await ipad.getByTestId('host-dd-field').boundingBox())!;
  expect(field.y).toBeGreaterThanOrEqual(band.y);
  expect(field.y + field.height).toBeLessThanOrEqual(band.y + band.height);
  // Invalid → Set stays off; a valid amount is set, shown, and enables Lock.
  await ipad.getByTestId('host-dd-input').fill('1');
  await expect(ipad.getByTestId('host-dd-set')).toBeDisabled();
  await ipad.getByTestId('host-dd-input').fill('700');
  await ipad.getByTestId('host-dd-set').click();
  s = await h.until((x) => x.clue?.pendingWager?.amount === 700);
  expect(s.timer).toBeNull();
  await expect(ipad.getByTestId('host-dd-pending')).toContainText('700');
  await expect(ipad.getByTestId('host-dd-lock')).toBeEnabled();
  await expect(phone.getByTestId('phone-dd-done')).toContainText('700');
  await shot(ipad, 'dd-host-entry');
  await ipad.getByTestId('host-dd-lock').click();
  s = await h.until((x) => x.clue?.stage === 'question');
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  // The clue shows; the answer time waits for the host.
  expect(s.timer).toBeNull();
  expect(s.clue.answerStarted).toBe(false);
  await expect(ipad.getByTestId('host-dd-start-timer')).toBeVisible();
  await expect(ipad.getByTestId('correct')).toHaveCount(0);
  await ipad.waitForTimeout(1500);
  expect((await h.until(() => true)).timer).toBeNull();
  await shot(ipad, 'dd-start-timer');
  await ipad.getByTestId('host-dd-start-timer').click();
  s = await h.until((x) => !!x.timer);
  expect(s.timer.kind).toBe('answer');
  expect(s.clue.answerStarted).toBe(true);
  await expect(ipad.getByTestId('correct')).toBeVisible();
  await expect(ipad.getByTestId('incorrect')).toBeVisible();
  await expect(ipad.getByTestId('host-dd-start-timer')).toHaveCount(0);
  // A host page opened now (a reconnect) shows the same step.
  const again = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
  await again.goto(`${BASE}/host`);
  await expect(again.getByTestId('correct')).toBeVisible();
  await ipad.getByTestId('correct').click();
  s = await h.until((x) => x.clue?.resolved === true);
  expect(s.competitors[0].score).toBe(700);
  h.close();
});

test('Daily Double! with player entry: Unlock Wager, the phone wagers, then Start Timer as well (R17-1, R17-2)', async () => {
  test.setTimeout(120_000);
  const { h, phone, g } = await phoneGame();
  await h.act({ type: 'updateRules', rules: { ...g.rules, dailyWagerEntry: 'player' } });
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
  await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
  await expect(ipad.getByTestId('host-dd-unlock')).toBeVisible();
  await expect(ipad.getByTestId('host-dd-input')).toHaveCount(0);
  await expect(ipad.getByTestId('host-dd-enter')).toBeVisible(); // the host can still enter it
  await ipad.getByTestId('host-dd-unlock').click();
  let s = await h.until((x) => x.timer?.kind === 'wager');
  await phone.getByTestId('phone-dd-input').fill('300');
  await phone.getByTestId('phone-dd-submit').click();
  s = await h.until((x) => x.clue?.pendingWager?.amount === 300);
  expect(s.timer).toBeNull();
  await ipad.getByTestId('host-dd-lock').click();
  s = await h.until((x) => x.clue?.stage === 'question');
  expect(s.timer).toBeNull();
  await ipad.getByTestId('host-dd-start-timer').click();
  await h.until((x) => x.timer?.kind === 'answer');
  h.close();
});

test('the wager field in the band stays above the keyboard; the TV picture keeps its size (R17-3)', async () => {
  test.setTimeout(150_000);
  const { h, g } = await phoneGame();
  await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
  await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
  for (const [dev, kbH] of [['iPad Pro 11 landscape', 420], ['iPad Pro 11', 400]] as const)
    for (const full of [false, true]) {
      const ipad = await (await wk.newContext({ ...devices[dev] })).newPage();
      await fakeKeyboard(ipad);
      await ipad.goto(`${BASE}/host`);
      await expect(ipad.getByTestId('host-dd-input')).toBeVisible();
      if (full) await ipad.getByTestId('fullscreen-toggle').click();
      await ipad.waitForTimeout(300);
      const stage = (await ipad.getByTestId('game-stage').boundingBox())!;
      await ipad.getByTestId('host-dd-input').click();
      await keyboard(ipad, kbH);
      const area = await visibleArea(ipad, kbH);
      for (const id of ['host-dd-input', 'host-dd-set']) await expectVisible(ipad, id, area);
      const lifted = (await ipad.getByTestId('game-stage').boundingBox())!;
      expect(Math.round(lifted.width)).toBe(Math.round(stage.width));
      expect(Math.round(lifted.height)).toBe(Math.round(stage.height));
      await ipad.getByTestId('host-dd-input').pressSequentially('450');
      await ipad.getByTestId('host-dd-input').press('Enter');
      await h.until((x) => x.clue?.pendingWager?.amount === 450);
      await shot(ipad, `dd-keyboard-${dev.includes('landscape') ? 'land' : 'port'}-${full ? 'full' : 'embedded'}`);
      await ipad.getByTestId('host-dd-input').blur();
      await keyboard(ipad, 0);
      await expect.poll(async () => (await ipad.getByTestId('game-stage').boundingBox())?.y).toBe(stage.y);
      await ipad.context().close();
    }
  h.close();
});

// ---------- Milestone B: keyboards ----------

test('iPad landscape lobby: WebKit scrolling the column back to the top after the keyboard opened does not hide the Wi-Fi field; closing restores the column (R17-5)', async () => {
  await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await fakeKeyboard(ipad);
  await ipad.goto(`${BASE}/host?kbdebug=1`);
  await expect(ipad.getByTestId('lobby-join')).toBeVisible();
  const wifi = ipad.getByTestId('wifi-share');
  if (!(await ipad.getByTestId('wifi-ssid').isVisible())) {
    if (!(await ipad.getByTestId('wifi-show').isChecked())) await ipad.getByTestId('wifi-show').check();
    if (!(await ipad.getByTestId('wifi-ssid').isVisible())) await wifi.locator('summary').click();
  }
  const column = ipad.getByTestId('lobby-join').locator('xpath=ancestor::div[contains(@class,"scroll-area")][1]');
  const kbH = 420;
  const area = await visibleArea(ipad, kbH);
  for (const id of ['wifi-ssid', 'wifi-password'] as const) {
    const max = await column.evaluate((el) => el.scrollHeight - el.clientHeight);
    const start = Math.min(80, max);
    await column.evaluate((el, s) => (el.scrollTop = s), start);
    // The field is far enough down that the column's top cannot show it above the keyboard.
    const offset = await ipad.getByTestId(id).evaluate((f) => f.getBoundingClientRect().bottom - (f.closest('.scroll-area') as HTMLElement).getBoundingClientRect().top + (f.closest('.scroll-area') as HTMLElement).scrollTop);
    expect(offset).toBeGreaterThan(area.bottom);
    await ipad.getByTestId(id).click();
    await keyboard(ipad, kbH);
    await expectVisible(ipad, id, area);
    // What the owner saw: the column jumps to its top a moment after the keyboard is up.
    await ipad.waitForTimeout(250);
    await column.evaluate((el) => (el.scrollTop = 0));
    for (const v of [id, 'wifi-save']) await expectVisible(ipad, v, area);
    await ipad.getByTestId(id).pressSequentially('xy');
    await expect(ipad.getByTestId(id)).toHaveValue(/xy$/);
    if (id === 'wifi-ssid') await shot(ipad, 'wifi-guard');
    await ipad.getByTestId(id).blur();
    await keyboard(ipad, 0);
    await expect(ipad.locator('html')).not.toHaveAttribute('data-keyboard', 'open');
    // Back where the host left it before typing.
    await expect.poll(() => column.evaluate((el) => Math.round(el.scrollTop))).toBe(start);
  }
  await expect(ipad.getByTestId('kb-debug')).toContainText('guard');
});

test('a scroll the user makes while typing is kept (the guard only undoes scrolls nobody asked for) (R17-5)', async () => {
  await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await fakeKeyboard(ipad);
  await ipad.goto(`${BASE}/host`);
  const wifi = ipad.getByTestId('wifi-share');
  if (!(await ipad.getByTestId('wifi-ssid').isVisible())) {
    if (!(await ipad.getByTestId('wifi-show').isChecked())) await ipad.getByTestId('wifi-show').check();
    if (!(await ipad.getByTestId('wifi-ssid').isVisible())) await wifi.locator('summary').click();
  }
  const column = ipad.getByTestId('lobby-join').locator('xpath=ancestor::div[contains(@class,"scroll-area")][1]');
  await ipad.getByTestId('wifi-ssid').click();
  await keyboard(ipad, 420);
  await expectVisible(ipad, 'wifi-ssid', await visibleArea(ipad, 420));
  // A finger drag: touchmove, then the scroll.
  await column.evaluate((el) => {
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true }));
    el.scrollTop = 0;
  });
  await ipad.waitForTimeout(400);
  expect(await column.evaluate((el) => el.scrollTop)).toBe(0);
  await ipad.getByTestId('wifi-ssid').blur();
  await keyboard(ipad, 0);
  await ipad.waitForTimeout(300);
  expect(await column.evaluate((el) => el.scrollTop)).toBe(0); // the user's choice stays
});

for (const [label, device, kbH] of [
  ['portrait', IPHONE_17_PRO, 346],
  ['landscape', IPHONE_17_PRO_LAND, 209],
] as const) {
  test(`iPhone 17 Pro ${label}: Daily Double! wager, Final wager and Final answer — field and Submit above the keyboard (R17-6)`, async () => {
    test.setTimeout(150_000);
    const { h, phone, g } = await phoneGame(device, true);
    const me = g.competitors[0].id;
    await h.act({ type: 'updateRules', rules: { ...g.rules, dailyWagerEntry: 'player' } });
    await h.act({ type: 'adjustScore', competitorId: me, delta: 2000 });
    await h.act({ type: 'setControl', competitorId: me });
    await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
    await h.act({ type: 'openDailyWager' });
    const check = async (field: string, submit: string, name: string) => {
      await phone.getByTestId(field).click();
      await keyboard(phone, kbH);
      const area = await visibleArea(phone, kbH);
      for (const id of [field, submit]) await expectVisible(phone, id, area);
      await shot(phone, `${name}-${label}`);
    };
    await check('phone-dd-input', 'phone-dd-submit', 'phone-dd');
    await phone.getByTestId('phone-dd-input').fill('500');
    await phone.getByTestId('phone-dd-submit').click(); // with the keyboard still up
    await h.until((x) => x.clue?.pendingWager?.amount === 500);
    await keyboard(phone, 0);
    await h.act({ type: 'setDailyWager', competitorId: me, amount: 500 });
    await h.act({ type: 'judge', result: 'correct' });
    await h.act({ type: 'startFinal' });
    await h.act({ type: 'finalNext' });
    await h.until((x) => x.final?.stage === 'wagers');
    await check('phone-final-wager-input', 'phone-final-wager-submit', 'phone-final-wager');
    await phone.getByTestId('phone-final-wager-input').fill('100');
    await phone.getByTestId('phone-final-wager-submit').click();
    await expect(phone.getByTestId('phone-final-wager-done')).toBeVisible();
    await keyboard(phone, 0);
    await h.act({ type: 'finalNext' });
    await h.until((x) => x.final?.stage === 'clue');
    await check('phone-final-answer', 'phone-final-answer-submit', 'phone-final-answer');
    await phone.getByTestId('phone-final-answer').fill('What is Salzburg?');
    await phone.getByTestId('phone-final-answer-submit').click();
    await expect(phone.getByTestId('phone-final-answer-done')).toBeVisible();
    h.close();
  });
}
