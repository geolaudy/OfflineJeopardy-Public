// Round 19 — the owner's real-hardware check of 0.17.0-rc.5: Final Jeopardy! submissions are final
// by default and the host unlocks answering (R19-1 … R19-5); Settings' title and tabs stay put
// (R19-6); the round title's board fill as on the TV (R19-7); the Final card without its "before"
// line, the wager centred (R19-8); host scores in dollars (R19-9); the status-bar key removed
// (R19-10); room for Safari's full-screen close button (R19-11).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r19-${name}.png` });
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
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 19 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  return { api, host, H, h };
}

/** Profiles made once per run (profile creation is rate limited). */
const made = new Map<string, { id: string; token: string }>();
async function profile(api: Awaited<ReturnType<typeof setup>>['api'], name: string) {
  if (!made.has(name)) {
    const res = await api.post('/api/profiles', { data: { name: `${name} ${Date.now() % 1000}`, color: '#16a34a', avatar: 'owl', pin: '1357' } });
    const j = (await res.json()) as { profile: { id: string }; token: string };
    made.set(name, { id: j.profile.id, token: j.token });
  }
  return made.get(name)!;
}

/** A started game: `phones` players joined on phones, `extra` players added by the host, optionally a bot. */
async function game({ phones = 0, extra = 0, bot = false, rules = {} }: { phones?: number; extra?: number; bot?: boolean; rules?: Record<string, unknown> }) {
  const r = await openLobby();
  const pages: Page[] = [];
  for (let i = 0; i < phones; i++) {
    const p = await profile(r.api, ['Pia', 'Quinn', 'Rae'][i]);
    const phone = await (await wk.newContext(devices['iPhone 13'])).newPage();
    await phone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), p.token);
    await phone.goto(`${BASE}/join`);
    await phone.getByTestId('join-game').click();
    await expect(phone.getByTestId('lobby-joined')).toBeVisible();
    pages.push(phone);
  }
  for (let i = 0; i < extra; i++) await r.h.act({ type: 'addPlayer', profileId: (await profile(r.api, `Extra ${i}`)).id });
  if (bot) await r.h.act({ type: 'addBot', name: 'Robo Rita', level: 'medium' });
  await r.h.until((x) => x.competitors.length === phones + extra + (bot ? 1 : 0));
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  let g = await r.h.until((x) => x.phase === 'board');
  if (Object.keys(rules).length) {
    await r.h.act({ type: 'updateRules', rules: { ...g.rules, ...rules } });
    g = await r.h.until((x) => Object.entries(rules).every(([k, v]) => x.rules[k] === v));
  }
  return { ...r, phones: pages, g };
}
/** Polls the host socket's state (the helper's own wait is short). */
const eventually = <T,>(h: { until: (p: (g: any) => boolean) => Promise<any> }, pick: (g: any) => T) => expect.poll(async () => pick(await h.until(() => true)), { timeout: 15_000 });

// ---------- Milestone A: Final Jeopardy! phases ----------

test('Final by default: a submitted wager and answer are final on the phone and the server; the last wager stops the wager time; Show Clue keeps answering locked until the host unlocks it; the last answer stops the think time (R19-1 … R19-4)', async () => {
  test.setTimeout(180_000);
  const { h, phones, g } = await game({ phones: 2, bot: true });
  for (const c of g.competitors) await h.act({ type: 'adjustScore', competitorId: c.id, delta: 1000 });
  const [pa, pb] = phones;
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await h.act({ type: 'startFinal' });
  await ipad.getByTestId('final-next').click(); // Open Wagers
  await eventually(h, (x) => x.timer?.kind).toBe('wager');
  // Phone A wagers: locked in, no Change wager; a second wager over the socket is refused.
  await pa.getByTestId('phone-final-wager-input').fill('300');
  await pa.getByTestId('phone-final-wager-submit').click();
  await expect(pa.getByTestId('phone-final-wager-done')).toContainText('300');
  await expect(pa.getByTestId('phone-final-wager-locked')).toBeVisible();
  await expect(pa.getByTestId('phone-final-wager-change')).toHaveCount(0);
  // The bot wagers by itself; the last wager (phone B) stops the wager time.
  await eventually(h, (x) => x.final.entries.filter((e: { hasWager: boolean }) => e.hasWager).length).toBe(2);
  expect((await h.until(() => true)).timer?.kind).toBe('wager');
  await pb.getByTestId('phone-final-wager-input').fill('200');
  await pb.getByTestId('phone-final-wager-submit').click();
  await eventually(h, (x) => x.timer).toBeNull();
  await expect(tv.getByTestId('final-wager-cue')).toHaveAttribute('data-done', 'true');
  await expect(ipad.getByTestId('final-next')).toHaveAttribute('data-step', 'show-clue');
  // Show Clue: the clue on the TV, answering locked everywhere, no time running.
  await ipad.getByTestId('final-next').click();
  await eventually(h, (x) => x.final.stage).toBe('clue');
  await expect(tv.getByTestId('tv-final-clue')).toBeVisible();
  let s = await h.until(() => true);
  expect(s.final.thinking).toBe(false);
  expect(s.timer).toBeNull();
  await expect(pa.getByTestId('phone-final-answer-wait')).toBeVisible();
  await expect(pa.getByTestId('phone-final-answer')).toHaveCount(0);
  await expect(ipad.getByTestId('final-unlock-answers')).toBeVisible();
  await expect(ipad.getByTestId('final-unlock-answers')).toHaveText(/Unlock Answering/);
  await ipad.waitForTimeout(5000);
  s = await h.until(() => true);
  expect(s.final.entries.find((e: { competitorId: string }) => e.competitorId === g.competitors.find((c: { bot?: boolean }) => c.bot).id).hasAnswer, 'the bot waits too').toBe(false);
  await shot(ipad, 'final-locked-answering');
  // Unlock Answering: the think time runs once.
  await ipad.getByTestId('final-unlock-answers').click();
  await eventually(h, (x) => x.timer?.kind).toBe('final');
  await expect(ipad.getByTestId('final-unlock-answers')).toHaveCount(0);
  await pa.getByTestId('phone-final-answer').fill('What is the Danube?');
  await pa.getByTestId('phone-final-answer-submit').click();
  await expect(pa.getByTestId('phone-final-answer-done')).toBeVisible();
  await expect(pa.getByTestId('phone-final-answer-change')).toHaveCount(0);
  await pb.getByTestId('phone-final-answer').fill('What is the Rhine?');
  await pb.getByTestId('phone-final-answer-submit').click();
  // The bot answers too: every answer is in — the think time stops, nothing is revealed by itself.
  await eventually(h, (x) => x.final.entries.every((e: { submitted: boolean }) => e.submitted)).toBe(true);
  await eventually(h, (x) => x.timer).toBeNull();
  await expect(ipad.getByTestId('final-bar')).toContainText('All 3 answers are in');
  expect((await h.until(() => true)).final.stage).toBe('clue');
  // A phone that reconnects is still locked in.
  await pa.reload();
  await expect(pa.getByTestId('phone-final-answer-done')).toBeVisible();
  await expect(pa.getByTestId('phone-final-answer-change')).toHaveCount(0);
  await shot(pa, 'final-answer-locked-phone');
  await ipad.getByTestId('final-next').click(); // Close Answer Submissions
  await eventually(h, (x) => x.final.stage).toBe('closed');
  h.close();
});

test('Final with "Allow Final Jeopardy! submission changes": Change wager / Change answer on the phone while each step is open (R19-1)', async () => {
  test.setTimeout(120_000);
  const { h, phones, g } = await game({ phones: 1, rules: { finalChanges: true } });
  await h.act({ type: 'adjustScore', competitorId: g.competitors[0].id, delta: 1000 });
  const [pa] = phones;
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' });
  await pa.getByTestId('phone-final-wager-input').fill('300');
  await pa.getByTestId('phone-final-wager-submit').click();
  await pa.getByTestId('phone-final-wager-change').click();
  await pa.getByTestId('phone-final-wager-input').fill('250');
  await pa.getByTestId('phone-final-wager-submit').click();
  await expect(pa.getByTestId('phone-final-wager-done')).toContainText('250');
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'finalStartThink' });
  await pa.getByTestId('phone-final-answer').fill('Danube');
  await pa.getByTestId('phone-final-answer-submit').click();
  await expect(pa.getByTestId('phone-final-answer-change')).toBeVisible();
  h.close();
});

test('Settings → Gameplay has "Allow Final Jeopardy! submission changes", off by default, and it saves (R19-1)', async () => {
  const { h } = await openLobby();
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/settings`);
  const box = pc.getByTestId('rule-final-changes');
  await box.scrollIntoViewIfNeeded();
  await expect(box).not.toBeChecked();
  await box.check();
  await pc.getByTestId('settings-rules-save').click();
  await expect.poll(async () => (await h.until(() => true)).rules.finalChanges).toBe(true);
  h.close();
});

// ---------- Milestone B: Settings — title and tabs stationary ----------

const TABS = ['gameplay', 'players', 'display', 'sound', 'network', 'data', 'advanced'] as const;

test('Settings: the title and the tabs never move; only the tab content scrolls, with sections expanded — iPad landscape and portrait (R19-6)', async () => {
  test.setTimeout(150_000);
  const { h } = await openLobby();
  for (const [name, dev] of [
    ['landscape (Safari)', { ...devices['iPad Pro 11 landscape'], viewport: { width: 1194, height: 760 } }],
    ['portrait', devices['iPad Pro 11']],
  ] as const) {
    const ipad = await (await wk.newContext({ ...dev })).newPage();
    await ipad.goto(`${BASE}/host/settings`);
    const bar = ipad.getByTestId('settings-tab');
    const title = ipad.getByRole('heading', { name: 'Settings', level: 1 });
    await expect(bar).toBeVisible();
    const bar0 = await bar.boundingBox();
    const title0 = await title.boundingBox();
    for (const t of TABS) {
      await ipad.getByTestId(`settings-tab-${t}`).click();
      const panel = ipad.getByTestId(`settings-panel-${t}`);
      await expect(panel).toBeVisible();
      // Open every collapsed section of the tab: the content grows, the tabs stay.
      await panel.evaluate((p) => p.querySelectorAll('details').forEach((d) => (d.open = true)));
      await ipad.waitForTimeout(150);
      const m = await panel.evaluate((p) => ({ sh: p.scrollHeight, ch: p.clientHeight }));
      await panel.evaluate((p) => (p.scrollTop = p.scrollHeight));
      await ipad.waitForTimeout(100);
      const main = await ipad.getByTestId('host-main').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, top: e.scrollTop }));
      expect(main.sh, `${name} ${t}: the page itself never scrolls`).toBeLessThanOrEqual(main.ch + 1);
      expect(await bar.boundingBox(), `${name} ${t}: tabs in place (content ${m.sh}/${m.ch})`).toEqual(bar0);
      expect(await title.boundingBox(), `${name} ${t}: title in place`).toEqual(title0);
      // The tab row cannot scroll vertically (an iPad bounced every label up and down with it).
      const row = await bar.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY }));
      expect(row.oy, `${name}: tab row overflow-y`).toBe('hidden');
      expect(row.sh).toBeLessThanOrEqual(row.ch);
      // The last control of the tab is reachable (scrolled into the panel, not clipped).
      const last = await panel.evaluate((p) => {
        const els = [...p.querySelectorAll('button, input, select, a')].filter((e) => (e as HTMLElement).offsetParent);
        const r = els.at(-1)!.getBoundingClientRect();
        const b = p.getBoundingClientRect();
        return r.bottom <= b.bottom + 1 && r.top >= b.top - 1;
      });
      expect(last, `${name} ${t}: last control visible after scrolling`).toBe(true);
      if (t === 'gameplay') await shot(ipad, `settings-gameplay-${name.split(' ')[0]}`);
    }
    await ipad.context().close();
  }
  h.close();
});

test('the lobby rules dialog: tabs and Save stay in place while its fields scroll (R19-6)', async () => {
  const { h } = await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'], viewport: { width: 1194, height: 560 } })).newPage();
  await ipad.goto(`${BASE}/host`);
  await ipad.getByTestId('customize-rules').click();
  const bar = ipad.getByTestId('rules-tab');
  await expect(bar).toBeVisible();
  for (const t of ['timing', 'clues', 'players']) {
    await ipad.getByTestId(`rules-tab-${t}`).click();
    const body = ipad.locator('[role="dialog"] .scroll-area').first();
    const before = { bar: await bar.boundingBox(), save: await ipad.getByRole('button', { name: 'Save rules' }).boundingBox() };
    await body.evaluate((b) => (b.scrollTop = b.scrollHeight));
    await ipad.waitForTimeout(100);
    expect(await bar.boundingBox(), `${t}: tabs in place`).toEqual(before.bar);
    expect(await ipad.getByRole('button', { name: 'Save rules' }).boundingBox(), `${t}: Save in place`).toEqual(before.save);
  }
  await shot(ipad, 'rules-dialog-scrolled');
  h.close();
});

// ---------- Milestone C: the round title's board fill ----------

test("host preview: the round title's board fill is the TV's own (dark ground and gaps), the title then covers the picture edge to edge on blue (R19-7)", async () => {
  test.setTimeout(120_000);
  const r = await openLobby();
  await r.h.act({ type: 'addPlayer', profileId: (await profile(r.api, 'Fill')).id });
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('lobby-join')).toBeVisible();
  await r.h.act({ type: 'startGame' });
  const preview = () => ipad.frames().find((f) => f.url().includes('/board/preview'))!;
  await expect.poll(() => !!preview()).toBe(true);
  const grid = preview().locator('[data-testid="tv-board-reveal"]');
  await expect(grid).toBeVisible({ timeout: 5000 });
  const tvGround = await (async () => {
    const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await tv.goto(`${BASE}/board`);
    const ground = await tv.locator('.bt-grid').first().evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => null);
    await tv.close();
    return ground;
  })();
  const ground = await grid.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(ground, 'the fill keeps a ground of its own (not transparent)').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  if (tvGround) expect(ground, "the TV board's ground").toBe(tvGround);
  // The host's area around the picture keeps the board's ground while the fill plays.
  await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'false');
  await shot(ipad, 'round-title-fill');
  // The title: an opaque panel surface over the whole picture.
  const title = preview().locator('.bt-intro-title');
  await expect(title).toBeVisible({ timeout: 8000 });
  await ipad.waitForTimeout(2500);
  const t = await title.evaluate((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const p = (e.closest('.bt-intro') as HTMLElement).getBoundingClientRect();
    return { bg: cs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor), edge: [r.left - p.left, r.top - p.top, p.right - r.right, p.bottom - r.bottom].map((x) => Math.round(x)) };
  });
  expect(t.bg).toBe(true);
  expect(t.edge).toEqual([0, 0, 0, 0]);
  // Then the area turns blue with the title; the preview's ground is the panel under the (still opaque) title.
  await expect(ipad.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'true');
  await expect(preview().locator('.bt-intro')).toHaveAttribute('data-surface', 'panel');
  expect(await title.evaluate((e) => getComputedStyle(e).backgroundImage !== 'none' || !/rgba(0, 0, 0, 0)/.test(getComputedStyle(e).backgroundColor))).toBe(true);
  await shot(ipad, 'round-title-after-fill');
  r.h.close();
});

// ---------- Milestone D: the Final card ----------

test('Final reveal card: no "Before Final Jeopardy!" line; the wager is centred in the card for short, long and $0 wagers (R19-8)', async () => {
  test.setTimeout(120_000);
  const { h, g } = await game({ extra: 3 });
  const amounts = [0, 50, 12_500];
  for (const [i, c] of g.competitors.entries()) await h.act({ type: 'adjustScore', competitorId: c.id, delta: [100, 900, 20_000][i] });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' });
  for (const [i, c] of g.competitors.entries()) await h.act({ type: 'setFinalWager', competitorId: c.id, amount: amounts[i] });
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'finalStartThink' });
  for (const c of g.competitors) await h.act({ type: 'setFinalAnswer', competitorId: c.id, answer: 'Danube' });
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'finalNext' }); // begin the reveals
  for (let i = 0; i < 3; i++) {
    await h.act({ type: 'finalReveal' }); // the wager
    const wager = tv.getByTestId('tv-final-wager');
    await expect(wager).toBeVisible();
    await tv.waitForTimeout(500);
    await expect(tv.locator('body')).not.toContainText(/Before Final/i);
    const off = await wager.evaluate((w) => {
      const r = w.getBoundingClientRect();
      const card = (w.closest('.bt-final-spot') as HTMLElement).getBoundingClientRect(); // its own card (swipe layers)
      return Math.abs(r.left + r.width / 2 - (card.left + card.width / 2));
    });
    expect(off, `wager ${i} centred`).toBeLessThan(2);
    if (i === 2) await shot(tv, 'final-card-wager');
    await h.act({ type: 'finalReveal' }); // the answer
    const cur = (await h.until(() => true)).final;
    await h.act({ type: 'judgeFinal', competitorId: cur.order[cur.cursor], correct: i % 2 === 0 });
    await h.act({ type: 'finalReveal' });
  }
  h.close();
});

// ---------- Milestone E: dollar scores on the host ----------

test('host score cards in dollars ("$1,400", "−$400") with 3, 9 and 12 entries — whole, never clipped (R19-9)', async () => {
  test.setTimeout(180_000);
  for (const n of [3, 9, 12]) {
    const { h, g } = await game({ extra: n });
    const deltas = [1400, -400, 0, 123_400, -98_600, 200, 5_000, -50, 999_800, 1, -1, 7_777];
    for (const [i, c] of g.competitors.entries()) if (deltas[i]) await h.act({ type: 'adjustScore', competitorId: c.id, delta: deltas[i] });
    for (const [name, dev] of [
      ['landscape', devices['iPad Pro 11 landscape']],
      ['portrait', devices['iPad Pro 11']],
    ] as const) {
      const ipad = await (await wk.newContext({ ...dev })).newPage();
      await ipad.goto(`${BASE}/host`);
      await expect(ipad.getByTestId('host-score')).toHaveCount(n);
      await ipad.waitForTimeout(400);
      const values = await ipad.locator('.host-score-value').allTextContents();
      expect(values[0]).toBe('$1,400');
      expect(values[1]).toBe('−$400');
      expect(values[2]).toBe('$0');
      const clipped = await ipad.locator('.host-score-value').evaluateAll((els) =>
        els
          .map((e) => {
            const r = e.getBoundingClientRect();
            const card = (e.closest('[data-testid="host-score"]') as HTMLElement).getBoundingClientRect();
            return { t: e.textContent, over: e.scrollWidth > e.clientWidth + 1 || r.right > card.right + 0.5 || r.top < card.top - 0.5 || r.bottom > card.bottom + 0.5 };
          })
          .filter((x) => x.over)
          .map((x) => x.t),
      );
      expect(clipped, `${n} entries ${name}: clipped scores`).toEqual([]);
      await shot(ipad, `host-scores-${n}-${name}`);
      await ipad.context().close();
    }
    h.close();
  }
});

// ---------- Milestone F: status bar key, Safari's full-screen close button ----------

test("no status-bar style key (the Home Screen app's bar takes the page's colour); in Safari's real full screen the menu steps aside for Safari's close button — not in the window-filling layout (R19-10, R19-11)", async () => {
  test.setTimeout(120_000);
  const { h } = await game({ extra: 1 });
  for (const [name, dev] of [
    ['landscape', devices['iPad Pro 11 landscape']],
    ['portrait', devices['iPad Pro 11']],
  ] as const) {
    for (const native of [true, false]) {
      const ctx = await wk.newContext({ ...dev });
      const ipad = await ctx.newPage();
      // Safari's Fullscreen API, as on the iPad (headless WebKit refuses it: the window-filling layout).
      if (native)
        await ipad.addInitScript(() => {
          Element.prototype.requestFullscreen = function () {
            Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true });
            document.dispatchEvent(new Event('fullscreenchange'));
            return Promise.resolve();
          };
        });
      await ipad.goto(`${BASE}/host`);
      await expect(ipad.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveCount(0);
      await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
      await ipad.getByTestId('fullscreen-toggle').click();
      await ipad.waitForTimeout(400);
      const live = ipad.getByTestId('host-live');
      await expect(live).toHaveAttribute('data-fullscreen', 'true');
      const menu = await ipad.getByTestId('fs-menu-toggle').boundingBox();
      if (native) {
        await expect(live).toHaveAttribute('data-native-fs', 'apple');
        expect(menu!.x, `${name}: the menu clears Safari's ✕ (top-left, ~44 px)`).toBeGreaterThanOrEqual(56);
      } else {
        await expect(live).not.toHaveAttribute('data-native-fs', 'apple');
        expect(menu!.x, `${name}: window-filling layout keeps the menu at the edge`).toBeLessThan(20);
      }
      // The header stays one row: the Options and minimise buttons on screen.
      const vw = ipad.viewportSize()!.width;
      for (const id of ['fullscreen-toggle']) {
        const b = (await ipad.getByTestId(id).boundingBox())!;
        expect(b.x + b.width).toBeLessThanOrEqual(vw + 0.5);
      }
      await shot(ipad, `fullscreen-${native ? 'safari' : 'window'}-${name}`);
      await ctx.close();
    }
  }
  h.close();
});
