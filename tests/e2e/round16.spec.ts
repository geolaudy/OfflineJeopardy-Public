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

// ---------- Daily Double! (R16-7 … R16-10) ----------

const rect = (p: Page, id: string) => p.getByTestId(id).evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
type Clue = { id: string; dailyWager?: boolean; used: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dailyDoubleOf = (g: any): Clue => g.rounds[g.roundIndex].categories.flatMap((c: { clues: Clue[] }) => c.clues).find((q: Clue) => q.dailyWager && !q.used);

/** A game with one player on a phone (and optionally a computer player), started. */
async function phoneGame(bot = false) {
  const r = await openLobby();
  const res = await r.api.post('/api/profiles', { data: { name: `Sixteen ${Date.now() % 100000}`, color: '#16a34a', avatar: 'owl', pin: '1357' } });
  const token = ((await res.json()) as { token: string }).token;
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), token);
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('join-game').click();
  await expect(phone.getByTestId('lobby-joined')).toBeVisible();
  if (bot) await r.h.act({ type: 'addBot', name: 'Robo Sixteen', level: 'expert' });
  await r.h.until((x) => x.competitors.length === (bot ? 2 : 1));
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  const g = await r.h.until((x) => x.phase === 'board');
  return { ...r, phone, g };
}

test("Daily Double!: locked until the host unlocks it; Unlock Wager starts the timer; the phone's wager stops it; Lock Wager & Show Clue (R16-7, R16-8, R16-10)", async () => {
  test.setTimeout(150_000);
  const { h, phone, g } = await phoneGame();
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  const dd = dailyDoubleOf(g);
  await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
  await h.act({ type: 'selectClue', clueId: dd.id });
  let s = await h.until((x) => x.clue?.stage === 'wager');
  expect(s.timer).toBeNull();
  expect(s.clue.wagerOpen).toBe(false);
  // The green main action is Unlock Wager, where Unlock Buzzers is on a clue.
  const unlock = ipad.getByTestId('host-dd-unlock');
  await expect(unlock).toBeVisible();
  await expect(unlock).toHaveClass(/host-btn-main/);
  await expect(ipad.getByTestId('host-dd-lock')).toHaveCount(0);
  await expect(ipad.getByTestId('host-dd-wager')).toContainText(/unlock the wager/i);
  await expect(phone.getByTestId('phone-dd-locked')).toBeVisible();
  await expect(phone.getByTestId('phone-dd-input')).toHaveCount(0);
  // R16-10: "Daily Double" in the category's size, whole, clear of Options.
  const label = await ipad.locator('.host-dd-value-label').evaluate((e) => ({ fs: parseFloat(getComputedStyle(e).fontSize), r: e.getBoundingClientRect().toJSON() as DOMRect, text: e.textContent }));
  const catFs = await ipad.getByTestId('host-clue-category').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(label.fs).toBe(catFs);
  expect(label.text).toContain('Daily Double');
  expect(await ipad.getByTestId('host-clue-value').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  const options = await rect(ipad, 'game-options');
  expect(label.r.right).toBeLessThanOrEqual(options.left);
  await shot(ipad, 'dd-locked');
  // Unlock: the timer starts once, the phone may wager.
  await unlock.click();
  s = await h.until((x) => !!x.timer);
  expect(s.timer.kind).toBe('wager');
  expect(s.clue.wagerOpen).toBe(true);
  await expect(ipad.getByTestId('host-dd-lock')).toBeDisabled();
  await phone.getByTestId('phone-dd-input').fill('300');
  await phone.getByTestId('phone-dd-submit').click();
  s = await h.until((x) => x.clue?.pendingWager?.amount === 300);
  expect(s.timer, 'the wager stopped the timer').toBeNull();
  await expect(ipad.getByTestId('host-dd-lock')).toBeEnabled();
  await expect(ipad.getByTestId('host-dd-pending')).toContainText('300');
  await expect(tv.getByTestId('clue-text')).toHaveCount(0); // nothing shown before the host locks
  await shot(ipad, 'dd-wager-in');
  await ipad.getByTestId('host-dd-lock').click();
  s = await h.until((x) => x.clue?.stage === 'question');
  expect(s.clue.wager.amount).toBe(300);
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  h.close();
});

test('Daily Double! for a computer player: it waits for Unlock Wager, then wagers; the host locks it (R16-9)', async () => {
  test.setTimeout(120_000);
  const { h, g } = await phoneGame(true);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  const bot = g.competitors.find((c: { bot?: string }) => c.bot);
  await h.act({ type: 'setControl', competitorId: bot.id });
  await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
  await ipad.waitForTimeout(4000);
  expect((await h.until(() => true)).clue.pendingWager).toBeNull();
  await ipad.getByTestId('host-dd-unlock').click();
  await expect(ipad.getByTestId('host-dd-pending')).toBeVisible({ timeout: 10_000 });
  const s = await h.until((x) => !!x.clue?.pendingWager);
  expect(s.clue.pendingWager.competitorId).toBe(bot.id);
  expect(s.timer).toBeNull();
  await ipad.getByTestId('host-dd-lock').click();
  await h.until((x) => x.clue?.stage === 'question');
  h.close();
});

test("TV Daily Double!: '… is wagering' sits low, in the clue text's area, well below the category (R16-12)", async () => {
  const { h, g } = await phoneGame();
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
  await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
  await expect(tv.getByTestId('tv-dd-who')).toBeVisible();
  await tv.waitForTimeout(1200);
  const who = await tv.getByTestId('tv-dd-who').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  const cat = await tv.locator('.bt-dw-cat').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  expect(who.top - cat.bottom, 'well below the category').toBeGreaterThan(1080 * 0.08);
  const stage = await tv.getByTestId('tv-stage').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  expect(who.top, 'in the lower half of the clue area').toBeGreaterThan(stage.top + stage.height * 0.6);
  expect(who.bottom).toBeLessThan(1080);
  await shot(tv, 'tv-dd');
  h.close();
});

// ---------- Final (R16-11, R16-13) ----------

test("Final: 'Enter your wagers now' above the bubbles; the contestant swipes to the screen's edges (R16-11, R16-13)", async () => {
  test.setTimeout(150_000);
  const { h, g } = await phoneGame(true);
  for (const c of g.competitors) await h.act({ type: 'adjustScore', competitorId: c.id, delta: 1000 });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startFinal' });
  await expect(tv.getByTestId('tv-final')).toBeVisible();
  await tv.waitForTimeout(900);
  const catBox = () => tv.locator('[data-swipe-layer="current"] .bt-intro-cat').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  const before = await catBox();
  await expect(tv.getByTestId('final-wager-cue')).toHaveCount(0);
  await h.act({ type: 'finalNext' }); // wagers
  await expect(tv.getByTestId('final-wager-cue')).toHaveText(/Enter your wagers now/i);
  await tv.waitForTimeout(900);
  const after = await catBox();
  expect(Math.abs(after.top - before.top)).toBeLessThan(1);
  const cue = await tv.getByTestId('final-wager-cue').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  const chips = await tv.locator('[data-final-chip]').first().evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  expect(cue.bottom, 'above the bubbles').toBeLessThanOrEqual(chips.top);
  expect(cue.top, 'clear of the category').toBeGreaterThan(after.bottom);
  expect(Math.abs(cue.left + cue.width / 2 - 960)).toBeLessThan(4);
  await shot(tv, 'final-wagers');
  const ids = g.competitors.map((c: { id: string }) => c.id as string);
  await tv.waitForTimeout(4000); // the computer player wagers by itself
  for (const id of ids) await h.act({ type: 'setFinalWager', competitorId: id, amount: 100 }).catch(() => {});
  await h.act({ type: 'finalNext' }); // the clue
  for (const id of ids) await h.act({ type: 'setFinalAnswer', competitorId: id, answer: 'A long answer that keeps going' }).catch(() => {});
  await h.act({ type: 'finalNext' }); // closed
  await h.act({ type: 'finalNext' }); // reveal
  await tv.waitForTimeout(1200);
  // The swipe's stage spans the whole screen (it was 5vw short of each edge).
  const stage = await tv.getByTestId('tv-final-spot-stage').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  expect(stage.left).toBeLessThanOrEqual(0.5);
  expect(stage.right).toBeGreaterThanOrEqual(1919.5);
  const first = (await h.until((x) => x.final?.stage === 'reveal')).final.order[0] as string;
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'judgeFinal', competitorId: first, correct: false });
  await h.act({ type: 'finalReveal' }); // next contestant: a swipe
  await tv.waitForTimeout(300);
  const leaving = tv.locator('.bt-final-spot-stage [data-swipe-layer="leaving"]');
  if (await leaving.count()) {
    const r = await leaving.first().evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
    expect(r.width, "the layer is the screen's width").toBeGreaterThan(1900);
  }
  await shot(tv, 'final-swipe');
  h.close();
});

// ---------- Bot pick glow (R16-14) ----------

test("a computer player's chosen tile glows from behind, square, blinking twice then holding, before the zoom (R16-14)", async () => {
  test.setTimeout(120_000);
  const { h, g } = await phoneGame(true);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await tv.waitForTimeout(1500);
  const bot = g.competitors.find((c: { bot?: string }) => c.bot);
  await h.act({ type: 'setControl', competitorId: bot.id });
  const picked = tv.locator('[data-picked="true"]');
  await expect(picked).toHaveCount(1, { timeout: 15_000 });
  const t0 = Date.now();
  const glow = await picked.evaluate((e) => {
    const a = getComputedStyle(e, '::after');
    return { anim: a.animationName, radius: a.borderTopLeftRadius, shadow: a.boxShadow, z: getComputedStyle(e).zIndex, overflow: getComputedStyle(e).overflow };
  });
  expect(glow.anim).toBe('bt-picked-blink');
  expect(glow.radius).toBe('0px');
  expect(glow.shadow).not.toContain('inset');
  expect(Number(glow.z)).toBeGreaterThan(0);
  expect(glow.overflow, 'the halo is not clipped by the cell').toBe('visible');
  await tv.waitForTimeout(Math.max(0, 850 - (Date.now() - t0))); // the third blink's hold
  await shot(tv, 'bot-glow');
  await expect(tv.getByTestId('tv-clue-panel')).toBeVisible({ timeout: 5000 });
  expect(Date.now() - t0, 'the zoom waits for the third blink').toBeGreaterThan(900);
  h.close();
});

// ---------- Host preview surroundings (R16-17 … R16-19) ----------

test("host preview: the blue around the clue continues the picture (no edge) and follows the TV's zoom in proportion and in time (R16-17, R16-19)", async () => {
  test.setTimeout(150_000);
  const { h } = await phoneGame();
  for (const dev of ['iPad Pro 11', 'iPad Pro 11 landscape'] as const) {
    const ipad = await (await wk.newContext({ ...devices[dev] })).newPage();
    await ipad.goto(`${BASE}/host`);
    await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
    await ipad.waitForTimeout(1500);
    const cur = await h.until((x) => x.phase === 'board');
    const clue = cur.rounds[cur.roundIndex].categories[2].clues.find((q: Clue) => !q.used && !q.dailyWager)!.id;
    const preview = ipad.frames().find((f) => f.url().includes('/board/preview'))!;
    await h.act({ type: 'selectClue', clueId: clue });
    // Read the fill's and the TV panel's zoom while they run.
    await expect.poll(() => ipad.getByTestId('host-stage-panel').evaluate((e) => e.getAnimations().length), { timeout: 3000, intervals: [10] }).toBeGreaterThan(0);
    const host = await ipad.getByTestId('host-stage-panel').evaluate((e) => {
      const a = e.getAnimations()[0] as Animation;
      const k = (a.effect as KeyframeEffect).getKeyframes();
      return { t: Number(a.currentTime), from: String(k[0].clipPath ?? ''), w: (e as HTMLElement).offsetWidth, h: (e as HTMLElement).offsetHeight };
    });
    const tvT = await preview.evaluate(() => {
      const a = document.querySelector('.bt-panel')?.getAnimations()[0];
      return a ? Number(a.currentTime) : null;
    });
    expect(tvT).not.toBeNull();
    expect(Math.abs(host.t - tvT!), `fill ${host.t} ms, TV ${tvT} ms into the zoom`).toBeLessThan(120);
    // It starts from the TV's tile scaled like the picture: the area's edges at the tile's scale.
    const m = host.from.match(/inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px\)/);
    expect(m, host.from).not.toBeNull();
    const [top, right, bottom, left] = m!.slice(1).map(Number);
    expect(top + bottom).toBeGreaterThan(host.h * 0.5);
    expect(left + right).toBeGreaterThan(host.w * 0.5);
    await ipad.waitForTimeout(1500);
    // No edge: the colour just outside the picture matches the picture's edge.
    const st = await rect(ipad, 'game-stage');
    const png = await ipad.screenshot();
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const dpr = info.width / devices[dev].viewport.width;
    const avg = (y: number) => {
      const sum = [0, 0, 0];
      let n = 0;
      for (let x = st.left + 10; x < st.right - 10; x += 7) {
        const i = (Math.round(y * dpr) * info.width + Math.round(x * dpr)) * info.channels;
        for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        n++;
      }
      return sum.map((v) => v / n);
    };
    for (const [inside, outside] of [[st.top + 2, st.top - 2], [st.bottom - 2, st.bottom + 2]] as const) {
      const banner = await rect(ipad, 'game-bar');
      if (outside < 70 || outside >= banner.top) continue; // no blue there (header / band)
      const a = avg(inside);
      const b = avg(outside);
      const diff = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      expect(diff, `edge at ${inside}/${outside}: ${a.map(Math.round)} vs ${b.map(Math.round)}`).toBeLessThan(4);
    }
    await shot(ipad, `preview-fill-${dev.endsWith('landscape') ? 'land' : 'port'}`);
    await h.act({ type: 'closeClue', clueId: clue });
    await ipad.context().close();
  }
  h.close();
});

// ---------- iPad status bar (R16-15) ----------

test('status bar: back to the plain default style, no painted strip (R16-15, K55)', async () => {
  const p = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await p.goto(`${BASE}/host`);
  await expect(p.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default');
  expect(await p.evaluate(() => getComputedStyle(document.body, '::before').content)).toMatch(/^(none|normal)$/);
});

test('Daily Double banner: the label in the category size and whole, the correct response on one line, in every view, before and after the lock (R16-10)', async () => {
  test.setTimeout(180_000);
  const { h, g } = await phoneGame();
  const dd = dailyDoubleOf(g);
  await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
  await h.act({ type: 'selectClue', clueId: dd.id });
  for (const locked of [false, true]) {
    if (locked) {
      await h.act({ type: 'enterDailyWager', competitorId: g.competitors[0].id, amount: 1000 });
      await h.act({ type: 'setDailyWager', competitorId: g.competitors[0].id, amount: 1000 });
    }
    for (const dev of ['iPad Pro 11 landscape', 'iPad Pro 11'] as const)
      for (const full of [false, true]) {
        const ipad = await (await wk.newContext({ ...devices[dev] })).newPage();
        await ipad.goto(`${BASE}/host`);
        await expect(ipad.getByTestId('host-dd-label')).toBeVisible();
        if (full) await ipad.getByTestId('fullscreen-toggle').click();
        await ipad.waitForTimeout(400);
        const m = await ipad.evaluate(() => {
          const band = document.querySelector('.host-head .host-answer-band') as HTMLElement;
          const label = document.querySelector('.host-answer-band-label') as HTMLElement;
          const dd = document.querySelector('.host-dd-value-label') as HTMLElement;
          const cat = document.querySelector('[data-testid="host-clue-category"]') as HTMLElement;
          const opts = document.querySelector('[data-testid="game-options"]') as HTMLElement;
          const r = (e: Element) => e.getBoundingClientRect();
          return {
            labelLines: Math.round(r(label).height / parseFloat(getComputedStyle(label).lineHeight)),
            ddFs: parseFloat(getComputedStyle(dd).fontSize),
            catFs: parseFloat(getComputedStyle(cat).fontSize),
            ddText: dd.textContent,
            ddTop: r(dd).top,
            ddBottom: r(dd.parentElement!).bottom,
            ddRight: r(dd.parentElement!).right,
            bandTop: r(band).top,
            bandBottom: r(band).bottom,
            optsLeft: r(opts).left,
            ansCentre: (r(label).left + r(label).right) / 2,
            headCentre: (r(band).left + r(band).right) / 2,
          };
        });
        const where = `${dev}${full ? ' full screen' : ''}${locked ? ' locked' : ''}`;
        expect(m.ddFs, where).toBe(m.catFs);
        expect(m.ddText, where).toContain('Daily Double');
        expect(m.labelLines, `${where}: "Correct response" on one line`).toBe(1);
        expect(m.ddTop, where).toBeGreaterThanOrEqual(m.bandTop - 1);
        expect(m.ddBottom, where).toBeLessThanOrEqual(m.bandBottom + 1);
        expect(m.ddRight, where).toBeLessThanOrEqual(m.optsLeft);
        expect(Math.abs(m.ansCentre - m.headCentre), `${where}: the response stays in the middle`).toBeLessThan(3);
        await shot(ipad, `dd-banner-${dev.endsWith('landscape') ? 'land' : 'port'}${full ? '-full' : ''}${locked ? '-locked' : ''}`);
        await ipad.context().close();
      }
  }
  h.close();
});
