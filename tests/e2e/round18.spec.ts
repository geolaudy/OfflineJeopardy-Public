// Round 18 — the owner's real-hardware check of 0.17.0-rc.4. R18-1: the iPad lobby's Wi-Fi fields
// jumped above and under the keyboard while typing (references/keyboard_diagnostics.png): with the
// keyboard open iPadOS reported visualViewport.offsetTop 484 while element boxes were measured from
// the top of what is shown, and the scroll guard undid WebKit's caret reveal on every keystroke.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r18-${name}.png` });
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
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 18 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  return { api, host, H, h };
}

/**
 * The on-screen keyboard as the owner's iPad reported it: the visual viewport shrinks by the keyboard
 * and is panned by `pan` (offsetTop), while the page's boxes (getBoundingClientRect) are measured
 * from the top of what is shown — `pan` lower than offsetTop says. `window.__shown(el)` is the box in
 * the real rendering, for the test's own checks.
 */
async function ipadKeyboard(p: Page) {
  await p.addInitScript(() => {
    const vv = new EventTarget();
    const full = () => document.documentElement.clientHeight;
    let kb = 0;
    let pan = 0;
    for (const [k, get] of Object.entries<() => number>({ height: () => full() - kb, width: () => document.documentElement.clientWidth, offsetTop: () => pan, offsetLeft: () => 0, pageTop: () => pan, pageLeft: () => 0, scale: () => 1 }))
      Object.defineProperty(vv, k, { get });
    Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: () => full() - kb, configurable: true });
    const real = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const r = real.call(this);
      return pan ? new DOMRect(r.x, r.y - pan, r.width, r.height) : r;
    };
    const w = window as unknown as Record<string, unknown>;
    w.__shown = (el: Element) => real.call(el);
    w.__kb = (h: number, p: number) => {
      kb = h;
      pan = p;
      vv.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    };
  });
}
const keyboard = (p: Page, h: number, pan: number) => p.evaluate(([x, y]) => (window as unknown as { __kb: (h: number, p: number) => void }).__kb(x, y), [h, pan]);

/** Is the field whole inside the part of the screen above the keyboard and inside its column, as drawn? */
const shownWhole = (p: Page, id: string, kbH: number) =>
  p.evaluate(
    ([id, kbH]) => {
      const shown = (window as unknown as { __shown: (el: Element) => DOMRect }).__shown;
      const f = document.querySelector(`[data-testid="${id}"]`)!;
      const r = shown(f);
      const col = shown(f.closest('.scroll-area')!);
      const full = document.documentElement.clientHeight;
      // As drawn, the shell sits from offsetTop (= kbH) to the bottom: the part iOS shows.
      return r.top >= Math.max(col.top, kbH) - 1 && r.bottom <= Math.min(col.bottom, full) + 1;
    },
    [id, kbH] as const,
  );

/** What WebKit does after each keystroke: scroll the field's column so the caret's field is in view. */
const caretReveal = (p: Page, id: string) =>
  p.evaluate((id) => {
    const shown = (window as unknown as { __shown: (el: Element) => DOMRect }).__shown;
    const f = document.querySelector(`[data-testid="${id}"]`)!;
    const col = f.closest('.scroll-area') as HTMLElement;
    const r = shown(f);
    const c = shown(col);
    if (r.bottom > c.bottom - 8) col.scrollTop += r.bottom - c.bottom + 8;
    else if (r.top < c.top + 8) col.scrollTop -= c.top + 8 - r.top;
    return Math.round(col.scrollTop);
  }, id);

async function wifiLobby() {
  await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipadKeyboard(ipad);
  await ipad.goto(`${BASE}/host?kbdebug=1`);
  await expect(ipad.getByTestId('lobby-join')).toBeVisible();
  if (!(await ipad.getByTestId('wifi-ssid').isVisible())) {
    if (!(await ipad.getByTestId('wifi-show').isChecked())) await ipad.getByTestId('wifi-show').check();
    if (!(await ipad.getByTestId('wifi-ssid').isVisible())) await ipad.getByTestId('wifi-share').locator('summary').click();
  }
  const column = ipad.getByTestId('lobby-join').locator('xpath=ancestor::div[contains(@class,"scroll-area")][1]');
  return { ipad, column };
}

// ---------- Milestone A: keyboard ----------

test('iPad lobby, keyboard panned like iPadOS reports it: Wi-Fi name and password stay above the keyboard through long typing, deleting and switching fields (R18-1)', async () => {
  test.setTimeout(120_000);
  const { ipad, column } = await wifiLobby();
  const kbH = 400;
  await column.evaluate((el) => (el.scrollTop = Math.min(60, el.scrollHeight - el.clientHeight)));
  const start = await column.evaluate((el) => Math.round(el.scrollTop));
  await ipad.getByTestId('wifi-ssid').click();
  await keyboard(ipad, kbH, kbH);
  await expect.poll(() => shownWhole(ipad, 'wifi-ssid', kbH), { message: 'name above the keyboard once it opened' }).toBe(true);
  const typeLong = async (id: string, text: string) => {
    for (const ch of text) {
      await ipad.getByTestId(id).press(ch === ' ' ? 'Space' : ch);
      await caretReveal(ipad, id);
      await ipad.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await shownWhole(ipad, id, kbH), `${id} visible after "${ch}"`).toBe(true);
    }
  };
  await typeLong('wifi-ssid', 'The Living Room Network 5G');
  for (let i = 0; i < 6; i++) await ipad.getByTestId('wifi-ssid').press('Backspace');
  expect(await shownWhole(ipad, 'wifi-ssid', kbH)).toBe(true);
  await ipad.getByTestId('wifi-ssid').press('ControlOrMeta+a');
  await typeLong('wifi-ssid', 'Replaced name');
  await expect(ipad.getByTestId('wifi-ssid')).toHaveValue('Replaced name');
  // Switching to the password with the keyboard up.
  await ipad.getByTestId('wifi-password').click();
  await expect.poll(() => shownWhole(ipad, 'wifi-password', kbH)).toBe(true);
  await typeLong('wifi-password', 'correct horse battery staple 42');
  await shot(ipad, 'wifi-typing');
  // The guard never had to argue with the browser's caret reveal.
  await expect(ipad.getByTestId('kb-debug')).not.toContainText('guard');
  await ipad.getByTestId('wifi-password').blur();
  await keyboard(ipad, 0, 0);
  await expect(ipad.locator('html')).not.toHaveAttribute('data-keyboard', 'open');
  await expect.poll(() => column.evaluate((el) => Math.round(el.scrollTop))).toBe(start);
});

test('the scroll guard never alternates with the browser: a position it comes back to wins (R18-1)', async () => {
  const { ipad, column } = await wifiLobby();
  const kbH = 400;
  await ipad.getByTestId('wifi-ssid').click();
  await keyboard(ipad, kbH, kbH);
  await expect.poll(() => shownWhole(ipad, 'wifi-ssid', kbH)).toBe(true);
  await ipad.waitForTimeout(200);
  const frames = () => ipad.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // A browser that insists on the column's top (rc.3's jump): corrected once …
  await column.evaluate((el) => (el.scrollTop = 0));
  await frames();
  expect(await column.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // … and when it comes back to the same place, it is left there (no ping-pong).
  await column.evaluate((el) => (el.scrollTop = 0));
  await frames();
  await ipad.waitForTimeout(150);
  expect(await column.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(ipad.getByTestId('kb-debug')).toContainText('guard rests');
});

// ---------- Milestone B: the Daily Double! band keeps its height ----------

type Clue = { id: string; dailyWager?: boolean; used: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dailyDoubleOf = (g: any): Clue => g.rounds[g.roundIndex].categories.flatMap((c: { clues: Clue[] }) => c.clues).find((q: Clue) => q.dailyWager && !q.used);

/** Profiles made once per run (profile creation is rate limited: 20 a minute). */
const made = new Map<string, string>();
async function profileId(api: Awaited<ReturnType<typeof setup>>['api'], name: string) {
  if (!made.has(name)) {
    const res = await api.post('/api/profiles', { data: { name: `${name} ${Date.now() % 1000}`, color: '#16a34a', avatar: 'owl', pin: '1357' } });
    made.set(name, ((await res.json()) as { profile: { id: string } }).profile.id);
  }
  return made.get(name)!;
}

/** A started solo game with `n` players added by the host (no phones needed). */
async function hostGame(n = 2, names = ['Alexandra Montgomery', 'Bartholomew Fitz', 'Cleo', 'Dmitri'], bot = false) {
  const r = await openLobby();
  if (bot) await r.h.act({ type: 'addBot', name: 'Robo Rita', level: 'medium' });
  for (let i = 0; i < n; i++) await r.h.act({ type: 'addPlayer', profileId: await profileId(r.api, names[i]) });
  await r.h.until((x) => x.competitors.length === n + (bot ? 1 : 0));
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  const g = await r.h.until((x) => x.phase === 'board');
  return { ...r, g };
}

const IPADS = [
  ['iPad Pro 11 landscape', devices['iPad Pro 11 landscape']],
  ['iPad Pro 11 portrait', devices['iPad Pro 11']],
  ['iPad Pro 13 landscape', { ...devices['iPad Pro 11 landscape'], viewport: { width: 1376, height: 954 }, screen: { width: 1376, height: 1032 } }],
  ['iPad mini portrait', devices['iPad Mini']],
] as const;

for (const entry of ['host', 'player'] as const)
  test(`Daily Double! (${entry} entry): every step keeps the band's height and the TV picture's place — iPads embedded and full screen (R18-2)`, async () => {
    test.setTimeout(300_000);
    for (const [name, device] of IPADS)
      for (const full of [false, true]) {
        const { h, g } = await hostGame();
        if (entry === 'player') await h.act({ type: 'updateRules', rules: { ...g.rules, dailyWagerEntry: 'player' } });
        const ipad = await (await wk.newContext({ ...device })).newPage();
        await ipad.goto(`${BASE}/host`);
        await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
        if (full) await ipad.getByTestId('fullscreen-toggle').click();
        await ipad.waitForTimeout(300);
        const band0 = await ipad.locator('[data-band]').first().getAttribute('data-band');
        const measure = async (step: string) => {
          await ipad.waitForTimeout(250);
          const bar = (await ipad.getByTestId('game-bar').boundingBox())!;
          const stage = (await ipad.getByTestId('game-stage').boundingBox())!;
          // Nothing in the band sticks out of it (wrapped rows, clipped buttons).
          const over = await ipad.getByTestId('game-bar').evaluate((b) => {
            const r = b.getBoundingClientRect();
            return [...b.querySelectorAll('button, input, p')]
              .filter((el) => {
                const e = el.getBoundingClientRect();
                // (A closed <details> keeps boxes in WebKit; they are not drawn.)
                return e.width > 0 && el.checkVisibility() && (e.top < r.top - 1 || e.bottom > r.bottom + 1 || e.right > r.right + 1);
              })
              .map((el) => `${el.tagName}[${el.getAttribute('data-testid') ?? el.textContent?.slice(0, 20)}] ${JSON.stringify(el.getBoundingClientRect())} in ${JSON.stringify(r)}`);
          });
          return { step, h: Math.round(bar.height), y: Math.round(bar.y), stage: `${Math.round(stage.x)},${Math.round(stage.y)},${Math.round(stage.width)}x${Math.round(stage.height)}`, over };
        };
        const steps = [];
        const me = g.competitors[0].id;
        await h.act({ type: 'setControl', competitorId: me });
        await h.act({ type: 'selectClue', clueId: dailyDoubleOf(g).id });
        await h.until((x) => x.clue?.stage === 'wager');
        await expect(ipad.getByTestId('host-dd-status')).toBeVisible();
        steps.push(await measure('wager'));
        if (entry === 'host') {
          await ipad.getByTestId('host-dd-input').fill('800');
          steps.push(await measure('typed'));
          await ipad.getByTestId('host-dd-set').click();
        } else {
          await ipad.getByTestId('host-dd-unlock').click();
          await h.until((x) => x.timer?.kind === 'wager');
          steps.push(await measure('unlocked'));
          await h.act({ type: 'enterDailyWager', competitorId: me, amount: 800 });
        }
        await h.until((x) => x.clue?.pendingWager?.amount === 800);
        await expect(ipad.getByTestId('host-dd-lock')).toBeEnabled();
        steps.push(await measure('wager in'));
        await shot(ipad, `dd-wager-${entry}-${name.replace(/ /g, '-')}-${full ? 'full' : 'embedded'}`);
        await ipad.getByTestId('host-dd-lock').click();
        await expect(ipad.getByTestId('host-dd-start-timer')).toBeVisible();
        steps.push(await measure('clue, time stopped'));
        await ipad.getByTestId('host-dd-start-timer').click();
        await expect(ipad.getByTestId('correct')).toBeVisible();
        steps.push(await measure('judging'));
        await shot(ipad, `dd-band-${entry}-${name.replace(/ /g, '-')}-${full ? 'full' : 'embedded'}`);
        await ipad.getByTestId('correct').click();
        await expect(ipad.getByTestId('back-to-board')).toBeVisible();
        steps.push(await measure('judged'));
        const where = `${name} ${full ? 'full screen' : 'embedded'}`;
        console.log(where, band0, JSON.stringify(steps));
        for (const s of steps) {
          expect(s.over, `${where}: ${s.step} — controls outside the band`).toEqual([]);
          expect(s.h, `${where}: ${s.step} — band height`).toBe(steps[0].h);
          expect(s.y, `${where}: ${s.step} — band top`).toBe(steps[0].y);
          expect(s.stage, `${where}: ${s.step} — TV picture`).toBe(steps[0].stage);
        }
        await ipad.context().close();
        h.close();
      }
  });

// ---------- Milestone C: Final Jeopardy! — every wager in ----------

test('Final: when every wager is in, "Enter your wagers now" fades out (the category stays put) and Lock Wagers becomes Show Clue — the host still decides (R18-3, R18-4)', async () => {
  test.setTimeout(120_000);
  const { h, g } = await hostGame(2, undefined, true);
  for (const c of g.competitors) await h.act({ type: 'adjustScore', competitorId: c.id, delta: 1000 });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await h.act({ type: 'startFinal' });
  await expect(ipad.getByTestId('final-control')).toBeVisible();
  await ipad.getByTestId('final-next').click(); // Open Wagers
  await h.until((x) => x.final?.stage === 'wagers');
  const cue = tv.getByTestId('final-wager-cue');
  await expect(cue).toBeVisible();
  await expect.poll(() => cue.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
  await expect(ipad.getByTestId('final-next')).toHaveText(/Lock Wagers/);
  await tv.waitForTimeout(1200); // the cue and the bubbles have finished coming in
  const kicker = tv.locator('.bt-kicker');
  const before = { kicker: await kicker.boundingBox(), cue: await cue.boundingBox() };
  const [human1, human2] = g.competitors.filter((c: { bot?: boolean }) => !c.bot);
  // One player in, the computer player wagers by itself: not everybody yet.
  await h.act({ type: 'setFinalWager', competitorId: human1.id, amount: 500 });
  await expect.poll(async () => (await h.until(() => true)).final.entries.filter((e: { hasWager: boolean }) => e.hasWager).length, { timeout: 15_000 }).toBe(2);
  await expect(ipad.getByTestId('final-next')).toHaveText(/Lock Wagers/);
  await expect(cue).not.toHaveAttribute('data-done', 'true');
  // The last wager — entered by the host for a player without a phone.
  await h.act({ type: 'setFinalWager', competitorId: human2.id, amount: 250 });
  await expect(ipad.getByTestId('final-next')).toHaveText(/Show Clue/);
  await expect(ipad.getByTestId('final-next')).toHaveAttribute('data-step', 'show-clue');
  await expect(ipad.getByTestId('final-bar')).toContainText('All 3 wagers are in');
  await expect(cue).toHaveAttribute('data-done', 'true');
  await expect.poll(() => cue.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
  // Nothing moved: the heading, and the cue's own line (kept, only transparent).
  expect(await kicker.boundingBox()).toEqual(before.kicker);
  expect(await cue.boundingBox()).toEqual(before.cue);
  await shot(tv, 'final-all-in-tv');
  await shot(ipad, 'final-all-in-host');
  // Not automatic: still wagering after a while.
  await tv.waitForTimeout(1500);
  expect((await h.until(() => true)).final.stage).toBe('wagers');
  // A host page opened now (reconnect) shows the same step.
  const again = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
  await again.goto(`${BASE}/host`);
  await expect(again.getByTestId('final-next')).toHaveText(/Show Clue/);
  await again.context().close();
  // Show Clue locks the wagers and shows the clue — no "missing" question.
  let asked = false;
  ipad.on('dialog', (d) => ((asked = true), d.dismiss()));
  await ipad.getByTestId('final-next').click();
  const s = await h.until((x) => x.final?.stage === 'clue');
  expect(asked).toBe(false);
  expect(s.final.entries.every((e: { hasWager: boolean }) => e.hasWager)).toBe(true);
  await expect(tv.getByTestId('tv-final-clue')).toBeVisible();
  h.close();
});

test('Final with one player: Show Clue once their wager is in; missing wagers keep Lock Wagers and its question (R18-4)', async () => {
  const { h, g } = await hostGame(1);
  await h.act({ type: 'adjustScore', competitorId: g.competitors[0].id, delta: 800 });
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' });
  await expect(ipad.getByTestId('final-next')).toHaveText(/Lock Wagers/);
  let asked = '';
  ipad.on('dialog', (d) => ((asked = d.message()), d.dismiss()));
  await ipad.getByTestId('final-next').click();
  await expect.poll(() => asked).toMatch(/1 wager\(s\) missing/);
  expect((await h.until(() => true)).final.stage).toBe('wagers');
  await h.act({ type: 'setFinalWager', competitorId: g.competitors[0].id, amount: 800 });
  await expect(ipad.getByTestId('final-next')).toHaveText(/Show Clue/);
  await expect(ipad.getByTestId('final-bar')).toContainText('The wager is in');
  h.close();
});

// ---------- Milestone D: the introduction ----------

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

/** Points inside the picture at its edges (where a black frame would be) and around it. */
async function edgePoints(p: Page) {
  const st = await p.getByTestId('game-stage').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  const bg = await p.getByTestId('host-stage-bg').evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  const cx = st.left + st.width / 2;
  return [
    { x: st.left + 3, y: st.top + st.height * 0.4 },
    { x: st.right - 3, y: st.top + st.height * 0.4 },
    { x: cx, y: st.top + 3 },
    { x: st.left + 3, y: st.top + 3 },
    { x: cx, y: Math.max(bg.top + 2, st.top - 6) },
    { x: Math.max(bg.left + 2, st.left - 6), y: st.top + st.height * 0.4 },
  ];
}

test('host preview: the round title ("Board 1") is blue edge to edge like the categories — embedded and full screen, portrait and landscape; the board keeps its frame (R18-5)', async () => {
  test.setTimeout(180_000);
  const r = await openLobby();
  const res = await r.api.post('/api/profiles', { data: { name: `Title ${Date.now() % 100000}`, color: '#1d4ed8', avatar: 'owl', pin: '2468' } });
  await r.h.act({ type: 'addPlayer', profileId: ((await res.json()) as { profile: { id: string } }).profile.id });
  await r.h.act({ type: 'startGame' });
  const g = await r.h.until((x) => !!x.intro);
  expect(g.intro.step).toBe(-1);
  for (const [name, dev] of [
    ['landscape', devices['iPad Pro 11 landscape']],
    ['portrait', devices['iPad Pro 11']],
  ] as const)
    for (const full of [false, true]) {
      const ipad = await (await wk.newContext({ ...dev })).newPage();
      await ipad.goto(`${BASE}/host`);
      await expect(ipad.getByTestId('intro-next')).toBeVisible();
      if (full) await ipad.getByTestId('fullscreen-toggle').click();
      await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'true');
      await ipad.waitForTimeout(1200);
      await shot(ipad, `round-title-${name}-${full ? 'full' : 'embedded'}`);
      for (const [i, c] of (await colourAt(ipad, await edgePoints(ipad))).entries()) expect(isBlue(c), `${name} ${full ? 'full screen' : 'embedded'} point ${i}: rgb(${c})`).toBe(true);
      await ipad.context().close();
    }
  // On into the categories (still blue), then the board: its frame is back.
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('intro-next')).toHaveText(/Show First Category/);
  await ipad.getByTestId('intro-next').click();
  await r.h.until((x) => x.intro?.step === 0);
  await expect(ipad.getByTestId('intro-next')).toHaveText(/Next Category/);
  await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'true');
  await r.h.act({ type: 'introSkip' });
  await r.h.until((x) => x.phase === 'board' && !x.intro);
  await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'false');
  r.h.close();
});

test('introduction band: Auto Present and Skip Category Presentation on the left, Previous then the main Next / Show First Category at the right end; the band keeps its height (R18-6)', async () => {
  test.setTimeout(150_000);
  const r = await openLobby();
  for (const [i, n] of ['Una', 'Vic'].entries()) {
    const res = await r.api.post('/api/profiles', { data: { name: `${n} Band ${Date.now() % 100000}`, color: '#1d4ed8', avatar: 'owl', pin: `13${i}5` } });
    await r.h.act({ type: 'addPlayer', profileId: ((await res.json()) as { profile: { id: string } }).profile.id });
  }
  await r.h.act({ type: 'startGame' });
  await r.h.until((x) => !!x.intro);
  for (const [name, dev] of [
    ['ipad-landscape', devices['iPad Pro 11 landscape']],
    ['ipad-portrait', devices['iPad Pro 11']],
    ['ipad-mini-portrait', devices['iPad Mini']],
    ['phone-landscape', devices['iPhone 13 landscape']],
  ] as const)
    for (const full of [false, true]) {
      const p = await (await wk.newContext({ ...dev })).newPage();
      await p.goto(`${BASE}/host`);
      await expect(p.getByTestId('intro-next')).toBeVisible();
      if (full) await p.getByTestId('fullscreen-toggle').click();
      await p.waitForTimeout(400);
      const box = async (id: string) => (await p.getByTestId(id).boundingBox())!;
      const [prev, next, auto, skip, bar] = await Promise.all(['intro-prev', 'intro-next', 'intro-auto', 'intro-skip', 'game-bar'].map(box));
      const where = `${name} ${full ? 'full' : 'embedded'}`;
      expect(Math.round(bar.height), `${where}: band at its planned height`).toBe(Number(await p.locator('[data-band]').first().getAttribute('data-band')));
      expect(auto.x + auto.width, `${where}: Auto left of Previous`).toBeLessThan(prev.x);
      expect(skip.x + skip.width, `${where}: Skip left of Previous`).toBeLessThan(prev.x);
      expect(prev.x + prev.width, `${where}: Previous left of Next`).toBeLessThanOrEqual(next.x + 0.5);
      expect(bar.x + bar.width - (next.x + next.width), `${where}: Next at the right end`).toBeLessThan(28);
      expect(next.width * next.height, `${where}: Next leads`).toBeGreaterThan(1.5 * prev.width * prev.height);
      for (const [id, b] of Object.entries({ prev, next, auto, skip })) {
        expect(b.y, `${where}: ${id} in the band`).toBeGreaterThanOrEqual(bar.y - 1);
        expect(b.y + b.height, `${where}: ${id} in the band`).toBeLessThanOrEqual(bar.y + bar.height + 1);
        expect(b.x, `${where}: ${id} on screen`).toBeGreaterThanOrEqual(0);
      }
      await shot(p, `intro-band-${name}-${full ? 'full' : 'embedded'}`);
      await p.context().close();
    }
  r.h.close();
});

// ---------- Milestone E: Settings → Players & Bots ----------

test('Settings → Players & Bots fits the iPad in landscape with Limits and fallback shown — Safari and Home Screen heights, with the Gemini help too; portrait scrolls gracefully (R18-7)', async () => {
  test.setTimeout(120_000);
  const { api, H, h } = await openLobby();
  const ai = (await (await api.get('/api/ai', { headers: H })).json()) as { config: Record<string, unknown> };
  try {
    for (const provider of ['anthropic', 'gemini'])
      for (const [name, viewport] of [
        ['iPad Pro 11 landscape, Safari', { width: 1194, height: 760 }],
        ['iPad Pro 11 landscape, Home Screen', { width: 1194, height: 810 }],
        ['iPad Pro 13 landscape, Safari', { width: 1376, height: 958 }],
      ] as const) {
        await api.put('/api/ai', { headers: H, data: { config: { ...ai.config, provider } } });
        const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'], viewport })).newPage();
        await ipad.goto(`${BASE}/host/settings?tab=players`);
        await expect(ipad.getByTestId('ai-limits')).toBeVisible();
        await expect(ipad.getByLabel('AI fallback')).toBeVisible();
        if (provider === 'gemini') await expect(ipad.getByTestId('ai-gemini-help')).toBeVisible();
        await ipad.waitForTimeout(250);
        const m = await ipad.getByTestId('host-main').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
        await shot(ipad, `settings-players-${provider}-${name.replace(/[ ,]+/g, '-')}`);
        expect(m.sh, `${provider}, ${name}: no scrolling`).toBeLessThanOrEqual(m.ch + 1);
        await ipad.context().close();
      }
    // Portrait: everything reachable by scrolling, nothing cut off sideways.
    const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
    await ipad.goto(`${BASE}/host/settings?tab=players`);
    for (const label of ['AI timeout', 'AI answers per game', 'AI fallback', 'API key']) {
      await ipad.getByLabel(label).scrollIntoViewIfNeeded();
      const b = (await ipad.getByLabel(label).boundingBox())!;
      expect(b.x + b.width, `${label} inside the screen`).toBeLessThanOrEqual(834);
    }
    await shot(ipad, 'settings-players-portrait');
    // The settings still save: the fallback.
    await ipad.getByLabel('AI fallback').selectOption('pass');
    await expect.poll(async () => ((await (await api.get('/api/ai', { headers: H })).json()) as { config: { fallback: string } }).config.fallback).toBe('pass');
  } finally {
    await api.put('/api/ai', { headers: H, data: { config: ai.config } });
    h.close();
  }
});

// ---------- Milestone F: the iPad status bar (K55) ----------

/**
 * Safari 26's rule for the colour of the opaque status bar (WebKit LocalFrameView::fixedContainerEdges,
 * as documented in RESEARCH_NOTES "round 18"): the element at the top centre, 4 px in; up to the first
 * position: fixed / sticky ancestor; it must span ≥ 90 % of the width; its background-color (alpha ≥
 * 0.75), else the body's background. An emulation of the rule — not the real bar (K55 needs the iPad).
 */
const statusBarColour = (p: Page) =>
  p.evaluate(() => {
    let el = document.elementFromPoint(innerWidth / 2, 4) as HTMLElement | null;
    while (el && !['fixed', 'sticky'].includes(getComputedStyle(el).position)) el = el.parentElement;
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    if (el) {
      const r = el.getBoundingClientRect();
      const [rr, g, b, a = 1] = parse(getComputedStyle(el).backgroundColor);
      if (r.width >= (innerWidth - 8) * 0.9 && a >= 0.75) return { from: el.className.split(' ').slice(0, 2).join('.'), rgb: [rr, g, b] };
    }
    const [rr, g, b] = parse(getComputedStyle(document.body).backgroundColor);
    return { from: 'body', rgb: [rr, g, b] };
  });

test('status bar (K55): by Safari 26\'s colour rule the bar is the header\'s navy in full screen (red with the correct response), white embedded beside the menu column and on the other pages; the header does not move (R18-8)', async () => {
  test.setTimeout(120_000);
  const { h, g } = await hostGame(1);
  const navy = [24, 30, 82];
  for (const [name, dev] of [
    ['landscape', devices['iPad Pro 11 landscape']],
    ['portrait', devices['iPad Pro 11']],
  ] as const) {
    const ipad = await (await wk.newContext({ ...dev })).newPage();
    await ipad.goto(`${BASE}/host`);
    await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
    const embedded = await statusBarColour(ipad);
    // Landscape: the menu column takes the screen's left, the header is narrower than the screen —
    // white. Portrait: the header itself is the top of the screen, edge to edge — it continues it.
    if (name === 'landscape') expect(embedded.rgb, `${name} embedded: not the navy (${JSON.stringify(embedded)})`).not.toEqual(navy);
    else expect(embedded, `${name} embedded`).toEqual({ from: 'host-head.host-dark', rgb: navy });
    const head0 = await ipad.getByTestId('game-strip').boundingBox();
    await ipad.getByTestId('fullscreen-toggle').click();
    await ipad.waitForTimeout(300);
    const full = await statusBarColour(ipad);
    expect(full, `${name} full screen`).toEqual({ from: 'host-head.host-dark', rgb: navy });
    // A clue with its correct response: red.
    const clue = g.rounds[0].categories[name === 'landscape' ? 0 : 1].clues.find((q: { dailyWager?: boolean }) => !q.dailyWager).id;
    await h.act({ type: 'selectClue', clueId: clue });
    await expect(ipad.locator('.host-answer-band')).toBeVisible();
    expect((await statusBarColour(ipad)).rgb, `${name} full screen, correct response`).toEqual([176, 31, 31]);
    await h.act({ type: 'revealAnswer', clueId: clue });
    await h.act({ type: 'closeClue', clueId: clue });
    await ipad.getByTestId('fullscreen-toggle').click();
    await ipad.waitForTimeout(300);
    expect(await ipad.getByTestId('game-strip').boundingBox(), `${name}: the header kept its place`).toEqual(head0);
    await ipad.goto(`${BASE}/host/settings`);
    expect((await statusBarColour(ipad)).rgb, `${name} settings: light`).not.toEqual(navy);
    await ipad.context().close();
  }
  h.close();
});
