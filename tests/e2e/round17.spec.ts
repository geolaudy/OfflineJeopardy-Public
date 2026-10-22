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

// ---------- Milestone D: the Final's reveal and results (R17-11) ----------

/** A started game with these contestants (no phones): the first five computer players (the game's
 *  limit), the rest players from new profiles; scores so everyone plays the Final. */
async function botGame(names: string[]) {
  const r = await openLobby();
  const stamp = Date.now() % 100000;
  for (const [i, name] of names.entries()) {
    if (i < 5) await r.h.act({ type: 'addBot', name, level: 'expert' });
    else {
      const p = await (await r.api.post('/api/profiles', { data: { name: `${name} ${stamp}`, color: '#1d4ed8', avatar: 'owl', pin: `24${String(i).padStart(2, '0')}` } })).json();
      await r.h.act({ type: 'addPlayer', profileId: p.profile?.id ?? p.id });
    }
  }
  await r.h.until((x) => x.competitors.length === names.length);
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  const g = await r.h.until((x) => x.phase === 'board');
  for (const [i, c] of g.competitors.entries()) await r.h.act({ type: 'adjustScore', competitorId: c.id, delta: 400 + 300 * i });
  return { ...r, g };
}

async function playFinalTo(h: Awaited<ReturnType<typeof hostSocket>>, ids: string[], answers: Record<string, string>) {
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' }); // wagers
  for (const id of ids) await h.act({ type: 'setFinalWager', competitorId: id, amount: 300 }).catch(() => {});
  await h.act({ type: 'finalNext' }); // the clue
  for (const id of ids) await h.act({ type: 'setFinalAnswer', competitorId: id, answer: answers[id] ?? 'What is Vienna?' }).catch(() => {});
  await h.act({ type: 'finalNext' }); // closed
  await h.act({ type: 'finalNext' }); // reveal
}

test('Final reveal: the contestant as one score card (answer inside, before / wager under it), the outline shows the verdict; results as score cards (R17-11)', async () => {
  test.setTimeout(180_000);
  const { h, g } = await botGame(['Professor Bartholomew Quizzington', 'Ann', 'Robo Kim']);
  const ids = g.competitors.map((c: { id: string }) => c.id as string);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await playFinalTo(h, ids, { [ids[0]]: 'What is the extraordinarily long-named city of Llanfairpwllgwyngyll in Wales?', [ids[1]]: 'Vienna', [ids[2]]: '' });
  const order = (await h.until((x) => x.final?.stage === 'reveal')).final.order as string[];
  const heading = () => tv.locator('[data-swipe-layer="current"] .bt-kicker').first().evaluate((e) => e.getBoundingClientRect().top);
  const top0 = await heading();
  for (const [i, id] of order.entries()) {
    await h.act({ type: 'finalReveal' }); // wager
    await h.act({ type: 'finalReveal' }); // answer
    await tv.waitForTimeout(1300);
    const card = tv.locator('.bt-final-spot-stage [data-swipe-layer="current"] .bt-final-spot');
    const box = (await card.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 960), 'centred').toBeLessThan(3);
    expect(box.y + box.height).toBeLessThan(1080);
    // The answer sits inside the card's inner panel; the wager under it.
    const ans = (await card.locator('.bt-final-answer-card').boundingBox())!;
    const wager = (await card.getByTestId('tv-final-wager').boundingBox())!;
    expect(ans.x).toBeGreaterThanOrEqual(box.x);
    expect(ans.x + ans.width).toBeLessThanOrEqual(box.x + box.width);
    expect(wager.y).toBeGreaterThanOrEqual(ans.y + ans.height);
    // The category and heading never move.
    expect(Math.abs((await heading()) - top0)).toBeLessThan(1);
    if (i === 0) await shot(tv, 'final-reveal-answer');
    await h.act({ type: 'judgeFinal', competitorId: id, correct: i !== 1 });
    await tv.waitForTimeout(700);
    await expect(card).toHaveAttribute('data-judged', i !== 1 ? 'correct' : 'incorrect');
    const outline = await card.evaluate((e) => getComputedStyle(e).outlineColor);
    expect(outline).toBe(i !== 1 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)');
    if (i === 1) await shot(tv, 'final-reveal-wrong');
    await h.act({ type: 'finalReveal' }); // next contestant (or the results)
  }
  await h.until((x) => x.final?.stage === 'done');
  await tv.waitForTimeout(1500);
  await shot(tv, 'final-results-3');
  const cat = await tv.locator('[data-swipe-layer="current"] .bt-intro-cat, [data-swipe-layer="current"] .bt-cat-title').first().boundingBox();
  const correct = (await tv.getByTestId('tv-final-correct').boundingBox())!;
  if (cat) expect(correct.y - (cat.y + cat.height), 'room under the category').toBeGreaterThan(10);
  const cards = tv.getByTestId('tv-final-card');
  await expect(cards).toHaveCount(3);
  for (const i of [0, 1, 2]) {
    const b = (await cards.nth(i).boundingBox())!;
    expect(b.y).toBeGreaterThan(correct.y + correct.height);
    expect(b.y + b.height).toBeLessThan(1080);
  }
  // Verdicts are outlines, not fills.
  const right = tv.locator('.bt-final-card.is-right').first();
  expect(await right.evaluate((e) => getComputedStyle(e).outlineColor)).toBe('rgb(34, 197, 94)');
  h.close();
});

test('Final results with 12 entries fit the TV in balanced rows (R17-11)', async () => {
  test.setTimeout(180_000);
  const names = Array.from({ length: 12 }, (_, i) => (i === 3 ? 'Maximilian Featherstonehaugh' : `Bot ${i + 1}`));
  const { h, g } = await botGame(names);
  const ids = g.competitors.map((c: { id: string }) => c.id as string);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await playFinalTo(h, ids, Object.fromEntries(ids.map((id: string, i: number) => [id, i % 3 === 0 ? 'What is a very long answer that wraps over more than one line on the card?' : 'Vienna'])));
  const order = (await h.until((x) => x.final?.stage === 'reveal')).final.order as string[];
  for (const [i, id] of order.entries()) {
    await h.act({ type: 'finalReveal' });
    await h.act({ type: 'finalReveal' });
    await h.act({ type: 'judgeFinal', competitorId: id, correct: i % 2 === 0 });
    await h.act({ type: 'finalReveal' });
  }
  await h.until((x) => x.final?.stage === 'done');
  await tv.waitForTimeout(1500);
  await shot(tv, 'final-results-12');
  const cards = tv.getByTestId('tv-final-card');
  await expect(cards).toHaveCount(12);
  const tops = new Set<number>();
  for (let i = 0; i < 12; i++) {
    const b = (await cards.nth(i).boundingBox())!;
    tops.add(Math.round(b.y));
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(1920);
    expect(b.y + b.height).toBeLessThan(1080);
  }
  expect(tops.size, 'two rows of six').toBe(2);
  h.close();
});

// ---------- Milestone F: the host preview's surface (R17-17) ----------

/** The colour (r, g, b) at a point of the page, from a screenshot. */
async function colourAt(p: Page, pts: { x: number; y: number }[]) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(await p.screenshot()).raw().toBuffer({ resolveWithObject: true });
  const dpr = info.width / p.viewportSize()!.width;
  return pts.map(({ x, y }) => {
    const i = (Math.round(y * dpr) * info.width + Math.round(x * dpr)) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  });
}
const isBlue = ([r, g, b]: number[]) => b > 70 && b > r + 40 && b > g + 30;

test("host preview: the introduction's categories fill the area edge to edge; the clue zoom and the blue around the picture are one surface on the TV zoom's own timeline (R17-17)", async () => {
  test.setTimeout(240_000);
  const r = await openLobby();
  const stamp = Date.now() % 100000;
  for (const [i, name] of ['Ann', 'Bob'].entries()) {
    const p = await (await r.api.post('/api/profiles', { data: { name: `${name} Surface ${stamp}`, color: '#1d4ed8', avatar: 'owl', pin: `57${i}1` } })).json();
    await r.h.act({ type: 'addPlayer', profileId: p.profile?.id ?? p.id });
  }
  await r.h.until((x) => x.competitors.length === 2);
  const h = r.h;
  await h.act({ type: 'startGame' });
  await h.until((x) => !!x.intro);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-live')).toBeVisible();
  const preview = () => ipad.frames().find((f) => f.url().includes('/board/preview'))!;
  // The first category: the panel's surface in the picture and around it, embedded and full screen.
  await h.act({ type: 'introNext' });
  await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'true');
  await expect(preview().locator('.bt-intro[data-surface="panel"]')).toBeVisible();
  expect(await preview().locator('.bt-intro-card').first().evaluate((e) => getComputedStyle(e).backgroundImage)).toBe('none');
  for (const full of [false, true]) {
    if (full) await ipad.getByTestId('fullscreen-toggle').click();
    await ipad.waitForTimeout(1200);
    const st = await ipad.getByTestId('game-stage').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
    const bg = await ipad.getByTestId('host-stage-bg').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
    const cx = st.left + st.width / 2;
    // Inside the picture at its edges (where the TV's black frame was) and in the area around it.
    const pts = [
      { x: st.left + 3, y: st.top + st.height * 0.4 },
      { x: st.right - 3, y: st.top + st.height * 0.4 },
      { x: cx, y: st.top + 3 },
      { x: cx, y: Math.max(bg.top + 2, st.top - 6) },
      { x: Math.max(bg.left + 2, st.left - 6), y: st.top + st.height * 0.4 },
    ];
    await shot(ipad, `intro-surface-${full ? 'full' : 'embedded'}`);
    for (const [i, c] of (await colourAt(ipad, pts)).entries()) expect(isBlue(c), `${full ? 'full screen' : 'embedded'} point ${i}: rgb(${c})`).toBe(true);
  }
  await ipad.getByTestId('fullscreen-toggle').click();
  await h.act({ type: 'introSkip' });
  const g = await h.until((x) => x.phase === 'board' && !x.intro);
  await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'false');
  await ipad.waitForTimeout(800);
  const clue = g.rounds[g.roundIndex].categories[1].clues.find((q: { used: boolean; dailyWager?: boolean }) => !q.used && !q.dailyWager)!.id as string;
  // The tile in the host's pixels, relative to the area (the preview reports nothing else needed).
  const tile = await ipad.evaluate((id) => {
    const frame = [...document.querySelectorAll('iframe')].find((f) => f.src.includes('/board/preview'))!;
    const fr = frame.getBoundingClientRect();
    const k = fr.width / frame.offsetWidth;
    const t = frame.contentDocument!.querySelector(`[data-clue-id="${id}"]`)!.getBoundingClientRect();
    const bg = document.querySelector('[data-testid="host-stage-bg"]')!.getBoundingClientRect();
    return { top: fr.top + t.top * k - bg.top, left: fr.left + t.left * k - bg.left, right: bg.right - (fr.left + t.right * k), bottom: bg.bottom - (fr.top + t.bottom * k) };
  }, clue);
  await h.act({ type: 'selectClue', clueId: clue });
  await expect.poll(() => ipad.getByTestId('host-stage-panel').evaluate((e) => e.getAnimations().length), { timeout: 3000, intervals: [10] }).toBeGreaterThan(0);
  const run = await ipad.evaluate(() => {
    const fill = document.querySelector<HTMLElement>('[data-testid="host-stage-panel"]')!;
    const a = fill.getAnimations()[0];
    const frame = [...document.querySelectorAll('iframe')].find((f) => f.src.includes('/board/preview'))!;
    const doc = frame.contentDocument!;
    const panel = doc.querySelector<HTMLElement>('.bt-panel')!;
    const tv = panel.getAnimations()[0];
    const offset = Number(document.timeline.currentTime) - Number(doc.timeline.currentTime);
    const k = (a.effect as KeyframeEffect).getKeyframes();
    const before = getComputedStyle(panel, '::before');
    return {
      start: [a.startTime == null ? null : Number(a.startTime), tv.startTime == null ? null : Number(tv.startTime) + offset],
      now: [Number(a.currentTime), Number(tv.currentTime)],
      timing: [JSON.stringify((a.effect as KeyframeEffect).getTiming()), JSON.stringify((tv.effect as KeyframeEffect).getTiming())],
      from: String(k[0].clipPath),
      to: String(k[k.length - 1].clipPath),
      bleedTop: parseFloat(before.top),
      varTop: parseFloat(getComputedStyle(panel).getPropertyValue('--pv-bleed-t')),
    };
  });
  // One timeline: the same start (on this page's clock), the same point in the zoom, the same timing.
  if (run.start[0] != null && run.start[1] != null) expect(Math.abs(run.start[0] - run.start[1]), `start ${run.start} (WebKit rounds timeline times to 1 ms)`).toBeLessThanOrEqual(2);
  expect(Math.abs(run.now[0] - run.now[1]), `now ${run.now}`).toBeLessThanOrEqual(2);
  const t0 = JSON.parse(run.timing[0]);
  const t1 = JSON.parse(run.timing[1]);
  expect([t0.duration, t0.delay, t0.easing]).toEqual([t1.duration, t1.delay, t1.easing]);
  // One surface: it starts on the tile (the whole blue, not just the picture's part) and ends on the area.
  const m = run.from.match(/inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px\)/)!;
  const [top, right, bottom, left] = m.slice(1).map(Number);
  expect(Math.abs(top - tile.top), `top ${top} vs ${tile.top}`).toBeLessThan(1.5);
  expect(Math.abs(left - tile.left), `left ${left} vs ${tile.left}`).toBeLessThan(1.5);
  expect(Math.abs(right - tile.right), `right ${right} vs ${tile.right}`).toBeLessThan(1.5);
  expect(Math.abs(bottom - tile.bottom), `bottom ${bottom} vs ${tile.bottom}`).toBeLessThan(1.5);
  expect(run.to).toMatch(/^inset\(0(\.00)?px( 0(\.00)?px){0,3}\)$/); // WebKit shortens it to inset(0px)
  // The TV panel carries the area past the picture (its bleed) in the preview.
  expect(run.varTop).toBeGreaterThan(0);
  expect(Math.abs(run.bleedTop + run.varTop)).toBeLessThan(0.5);
  // Mid-zoom (both held at the same point): the blue is one rectangle across the picture's top edge.
  const mid = await ipad.evaluate(() => {
    const fill = document.querySelector<HTMLElement>('[data-testid="host-stage-panel"]')!;
    const a = fill.getAnimations()[0];
    const frame = [...document.querySelectorAll('iframe')].find((f) => f.src.includes('/board/preview'))!;
    const tv = frame.contentDocument!.querySelector<HTMLElement>('.bt-panel')!.getAnimations()[0];
    const at = Number((a.effect as KeyframeEffect).getTiming().duration) * 0.35;
    for (const x of [a, tv]) {
      x.pause();
      x.currentTime = at;
    }
    const st = document.querySelector('[data-testid="game-stage"]')!.getBoundingClientRect();
    const bg = document.querySelector('[data-testid="host-stage-bg"]')!.getBoundingClientRect();
    const m = getComputedStyle(fill).clipPath.match(/inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px\)/)!.slice(1).map(Number);
    return { stTop: st.top, left: bg.left + m[3], right: bg.right - m[1], top: bg.top + m[0] };
  });
  await ipad.waitForTimeout(100);
  await shot(ipad, 'clue-zoom-mid');
  expect(mid.top, 'the blue reaches above the picture mid-zoom').toBeLessThan(mid.stTop);
  const edge = await colourAt(ipad, [
    { x: mid.left + 4, y: mid.stTop - 4 },
    { x: mid.left + 4, y: mid.stTop + 4 },
    { x: mid.right - 4, y: mid.stTop - 4 },
    { x: mid.right - 4, y: mid.stTop + 4 },
  ]);
  for (const [i, c] of edge.entries()) expect(isBlue(c), `mid-zoom edge point ${i}: rgb(${c})`).toBe(true);
  await ipad.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="host-stage-panel"]')!.getAnimations()[0]?.play();
    const frame = [...document.querySelectorAll('iframe')].find((f) => f.src.includes('/board/preview'))!;
    frame.contentDocument!.querySelector<HTMLElement>('.bt-panel')!.getAnimations()[0]?.play();
  });
  await ipad.waitForTimeout(1500);
  await shot(ipad, 'clue-surface');
  h.close();
});

test('category introduction band: Next Category leads, Previous quieter right beside it, Auto Present and Skip Category Presentation small but visible; quick taps never stack swipes (R17-17.5)', async () => {
  test.setTimeout(240_000);
  const r = await openLobby();
  const stamp = Date.now() % 100000;
  for (const [i, name] of ['Cy', 'Di'].entries()) {
    const p = await (await r.api.post('/api/profiles', { data: { name: `${name} Band ${stamp}`, color: '#1d4ed8', avatar: 'owl', pin: `68${i}2` } })).json();
    await r.h.act({ type: 'addPlayer', profileId: p.profile?.id ?? p.id });
  }
  await r.h.until((x) => x.competitors.length === 2);
  const h = r.h;
  await h.act({ type: 'startGame' });
  await h.until((x) => !!x.intro);
  await h.act({ type: 'introNext' });
  for (const [name, dev] of [
    ['ipad-portrait', devices['iPad Pro 11']],
    ['ipad-landscape', devices['iPad Pro 11 landscape']],
    ['phone-landscape', devices['iPhone 13 landscape']],
  ] as const) {
    const p = await (await wk.newContext({ ...dev })).newPage();
    await p.goto(`${BASE}/host`);
    await expect(p.getByTestId('intro-next')).toBeVisible();
    await p.waitForTimeout(400);
    const box = async (id: string) => (await p.getByTestId(id).boundingBox())!;
    const [prev, next, auto, skip, bar] = await Promise.all(['intro-prev', 'intro-next', 'intro-auto', 'intro-skip', 'game-bar'].map(box));
    const vw = p.viewportSize()!.width;
    for (const [id, b] of Object.entries({ prev, next, auto, skip })) {
      expect(b.x, `${name}: ${id} on screen`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${name}: ${id} on screen`).toBeLessThanOrEqual(vw + 0.5);
      expect(b.y, `${name}: ${id} in the band`).toBeGreaterThanOrEqual(bar.y - 1);
      expect(b.y + b.height, `${name}: ${id} in the band`).toBeLessThanOrEqual(bar.y + bar.height + 1);
    }
    expect(next.width * next.height, `${name}: Next leads`).toBeGreaterThan(1.5 * prev.width * prev.height);
    expect(prev.x + prev.width, `${name}: Previous left of Next`).toBeLessThanOrEqual(next.x + 0.5);
    expect(next.x - (prev.x + prev.width), `${name}: right beside it`).toBeLessThan(16);
    expect(auto.height, `${name}: Auto Present is small`).toBeLessThan(next.height * 0.75);
    await expect(p.getByTestId('intro-skip')).toHaveText('Skip Category Presentation');
    await expect(p.getByTestId('intro-auto')).toHaveAttribute('aria-checked', 'false');
    // The score cards stay visible under the band.
    const cards = p.getByTestId('host-score');
    if (await cards.count()) {
      const c = (await cards.first().boundingBox())!;
      expect(c.y, `${name}: score cards under the band`).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      expect(c.y + c.height, `${name}: score cards on screen`).toBeLessThanOrEqual(p.viewportSize()!.height + 1);
    }
    await shot(p, `intro-band-${name}`);
    await p.context().close();
  }
  // Quick taps: one swipe at a time.
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('intro-next')).toBeEnabled();
  const before = (await h.until((x) => !!x.intro)).intro.step as number;
  await ipad.getByTestId('intro-next').click();
  for (let i = 0; i < 3; i++) await ipad.getByTestId('intro-next').click({ force: true, timeout: 500 }).catch(() => {});
  await ipad.waitForTimeout(300);
  expect((await h.until((x) => !!x.intro)).intro.step, 'quick taps during the swipe are not new steps').toBe(before + 1);
  await expect(ipad.getByTestId('intro-next')).toBeEnabled({ timeout: 2000 });
  await ipad.getByTestId('intro-prev').click();
  await h.until((x) => x.intro?.step === before);
  // Auto Present: a switch that shows its state; Skip Category Presentation ends the introduction.
  await ipad.getByTestId('intro-auto').click();
  await expect(ipad.getByTestId('intro-stop-auto')).toHaveAttribute('aria-checked', 'true');
  await ipad.getByTestId('intro-stop-auto').click();
  await expect(ipad.getByTestId('intro-auto')).toHaveAttribute('aria-checked', 'false');
  const scores = (await h.until((x) => !!x.intro)).competitors.map((c: { score: number }) => c.score);
  await ipad.getByTestId('intro-skip').click();
  const g = await h.until((x) => x.phase === 'board' && !x.intro);
  expect(g.competitors.map((c: { score: number }) => c.score)).toEqual(scores);
  expect(g.rounds[g.roundIndex].categories.flatMap((c: { clues: { used: boolean }[] }) => c.clues).some((q: { used: boolean }) => q.used)).toBe(false);
  h.close();
});

// ---------- Milestone E (R17-12, R17-13) ----------

test("TV Daily Double!: '… is wagering' is centred between the category's bottom and the clue area's bottom (R17-12)", async () => {
  test.setTimeout(120_000);
  const r = await openLobby();
  const stamp = Date.now() % 100000;
  const p = await (await r.api.post('/api/profiles', { data: { name: `Wagering Wanda ${stamp}`, color: '#1d4ed8', avatar: 'owl', pin: '7913' } })).json();
  await r.h.act({ type: 'addPlayer', profileId: p.profile?.id ?? p.id });
  await r.h.until((x) => x.competitors.length === 1);
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  const g = await r.h.until((x) => x.phase === 'board');
  const dd = g.rounds[g.roundIndex].categories.flatMap((c: { clues: { id: string; dailyWager?: boolean }[] }) => c.clues).find((q: { dailyWager?: boolean }) => q.dailyWager)!.id;
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 1024 }]) {
    const tv = await (await cr.newContext({ viewport: vp })).newPage();
    await tv.goto(`${BASE}/board`);
    if (vp.width === 1920) await r.h.act({ type: 'selectClue', clueId: dd });
    await expect(tv.getByTestId('tv-dd-who')).toBeVisible();
    await tv.waitForTimeout(1500);
    const who = (await tv.getByTestId('tv-dd-who').boundingBox())!;
    const cat = (await tv.locator('.bt-dw-cat').boundingBox())!;
    const stage = (await tv.getByTestId('tv-stage').boundingBox())!;
    const mid = (cat.y + cat.height + stage.y + stage.height) / 2;
    expect(Math.abs(who.y + who.height / 2 - mid), `${vp.width}×${vp.height}: centred`).toBeLessThan(3);
    await shot(tv, `dd-wagering-${vp.width}x${vp.height}`);
    await tv.context().close();
  }
  r.h.close();
});

test('lobby: a computer player\'s level reads in full ("Medium" whole) on an iPad in portrait and landscape (R17-13)', async () => {
  test.setTimeout(120_000);
  const r = await openLobby();
  await r.h.act({ type: 'addBot', name: 'Professor Bartholomew Quizzington', level: 'medium' });
  await r.h.act({ type: 'addBot', name: 'Kim', level: 'medium' });
  await r.h.until((x) => x.competitors.length === 2);
  for (const dev of ['iPad Pro 11', 'iPad Pro 11 landscape', 'iPad Mini'] as const) {
    const ipad = await (await wk.newContext({ ...devices[dev] })).newPage();
    await ipad.goto(`${BASE}/host`);
    const texts = ipad.getByTestId('bot-level-text');
    await expect(texts).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(texts.nth(i)).toHaveText('Medium');
      const fit = await texts.nth(i).evaluate((e) => {
        const badge = e.closest('[data-testid="bot-level-badge"]')!.getBoundingClientRect();
        const t = e.getBoundingClientRect();
        return { clipped: e.scrollWidth > e.clientWidth + 0.5, inside: t.left >= badge.left - 0.5 && t.right <= badge.right + 0.5 };
      });
      expect(fit, `${dev}: label ${i}`).toEqual({ clipped: false, inside: true });
    }
    await shot(ipad, `bot-level-${dev.replace(/ /g, '-')}`);
    // The level still changes through the system picker.
    if (dev === 'iPad Pro 11') {
      await ipad.getByLabel('Kim difficulty').selectOption('hard');
      await expect(texts.nth(1)).toHaveText(/Hard/);
      await ipad.getByLabel('Kim difficulty').selectOption('medium');
    }
    await ipad.context().close();
  }
  r.h.close();
});
