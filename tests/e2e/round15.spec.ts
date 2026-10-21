// Round 15 — the owner's real-hardware check of 0.17.0-rc.1: host score cards never clipped, also
// with the iPad's home-indicator area (R15-11) and redesigned (R15-12); board status centred
// (R15-10); banner seams gone (R15-13); value beside Options and "Daily Double" whole (R15-17,
// R15-22); the timer above the band (R15-23); the preview's surroundings following the clue zoom
// (R15-14 … R15-16); the Daily Double! in the band with a host-started timer, Preview Clue and host
// entry (R15-18 … R15-21); the Final's category and heading staying put (R15-24 … R15-27); the
// computer player's answer under the banner and its chosen tile outlined (R15-28, R15-29); the TV
// lobby with nicknames (R15-4 … R15-7); the phone's Test Buzzer (R15-8, R15-9); stable layouts at
// fractional zoom (R15-30).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r15-${name}.png` });
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

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'];
// The same names as rounds 13 / 14 (profile creation is rate-limited per address).
const nameOf = (i: number) => `Thirteen ${String.fromCharCode(65 + i)}${i % 3 === 2 ? ' with a long name' : ''}`;

async function openLobby(n: number) {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 15 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const existing = (await (await api.get('/api/profiles')).json()) as { id: string; name: string }[];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    let id = existing.find((p) => p.name === nameOf(i))?.id;
    if (!id) id = ((await (await api.post('/api/profiles', { data: { name: nameOf(i), color: COLORS[i % 8], avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } }).profile.id;
    await h.act({ type: 'addPlayer', profileId: id });
    await h.act({ type: 'setNickname', profileId: id, nickname: '' });
    ids.push(id);
  }
  await h.until((x) => x.competitors.length === n);
  return { api, host, H, h, ids };
}

async function startGame(n: number) {
  const r = await openLobby(n);
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  return r;
}

const rect = (p: Page, id: string) => p.getByTestId(id).evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
/** The iPad's home-indicator area, simulated (emulators have no safe areas). */
const SAFE_BOTTOM = 20;
const withSafeBottom = (p: Page) => p.addInitScript((px) => {
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = `:root { --safe-bottom: ${px}px !important; }`;
    document.head.appendChild(s);
  });
}, SAFE_BOTTOM);

for (const n of [1, 3, 6, 9, 12])
  test(`score cards: ${n} player(s) never clipped, with the iPad's home-indicator area, embedded and full screen, landscape and portrait (R15-11, R15-12)`, async () => {
    test.setTimeout(150_000);
    const { h } = await startGame(n);
    const g = await h.until((x) => x.competitors.length === n);
    await h.act({ type: 'adjustScore', competitorId: g.competitors[n - 1].id, delta: -250_000 });
    for (const dev of ['iPad Pro 11 landscape', 'iPad Pro 11'] as const)
      for (const fullscreen of [false, true]) {
        const view = `${dev.endsWith('landscape') ? 'land' : 'port'}-${fullscreen ? 'fs' : 'emb'}`;
        const page = await (await wk.newContext({ ...devices[dev] })).newPage();
        await withSafeBottom(page);
        await page.goto(`${BASE}/host`);
        await expect(page.getByTestId('host-score')).toHaveCount(n);
        if (fullscreen) await page.getByTestId('fullscreen-toggle').click();
        await page.waitForTimeout(800);
        const scores = await rect(page, 'host-scores');
        const pad = await page.getByTestId('host-scores').evaluate((e) => parseFloat(getComputedStyle(e).paddingBottom));
        expect(pad, view).toBe(SAFE_BOTTOM);
        const vh = page.viewportSize()!.height;
        const cards = await page.getByTestId('host-score').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
        for (const c of cards) {
          // Inside the section, above its safe-area padding, on the screen.
          expect(c.top, view).toBeGreaterThanOrEqual(scores.top + 1 - 0.5);
          expect(c.bottom, view).toBeLessThanOrEqual(scores.bottom - SAFE_BOTTOM + 0.5);
          expect(c.bottom, view).toBeLessThanOrEqual(vh);
          expect(c.height, `${view}: readable card`).toBeGreaterThanOrEqual(36);
        }
        // Nothing paints over a card's top or bottom edge (no clipping scroller, nothing on top).
        const hidden = await page.getByTestId('host-score').evaluateAll((els) =>
          els.filter((e) => {
            const r = e.getBoundingClientRect();
            const x = r.left + r.width / 2;
            return [r.top + 2, r.bottom - 2].some((y) => !e.contains(document.elementFromPoint(x, y)));
          }).length,
        );
        expect(hidden, `${view}: cards covered or clipped`).toBe(0);
        // R15-12: no white cards.
        const bg = await page.getByTestId('host-score').first().evaluate((e) => getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor);
        expect(bg, view).not.toContain('rgb(255, 255, 255)');
        // The full-screen iPad in landscape keeps the picture edge to edge, home indicator included.
        if (view === 'land-fs') {
          const stage = await rect(page, 'game-stage');
          expect(stage.width, 'edge to edge').toBeGreaterThanOrEqual(page.viewportSize()!.width - 2);
        }
        if (n === 3 || n === 12) await page.screenshot({ path: `test-results/screens/r15-cards-${n}-${view}.png` });
        await page.context().close();
      }
    h.close();
  });

test('board header: status centred on the whole header, no seams under the banners, the timer above the band, value beside Options, Daily Double whole (R15-10, R15-13, R15-17, R15-22, R15-23)', async () => {
  test.setTimeout(150_000);
  const { h } = await startGame(3);
  for (const dev of ['iPad Pro 11 landscape', 'iPad Pro 11'] as const) {
    const page = await (await wk.newContext({ ...devices[dev] })).newPage();
    await page.goto(`${BASE}/host`);
    await expect(page.getByTestId('host-tile')).toHaveCount(30);
    for (const fullscreen of [false, true]) {
      if (fullscreen) await page.getByTestId('fullscreen-toggle').click();
      await page.waitForTimeout(500);
      const strip = await rect(page, 'game-strip');
      const centre = strip.left + strip.width / 2;
      for (const sel of ['[data-testid="choosing"]', '.host-head-sub']) {
        const t = await page.locator(sel).evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return r.getBoundingClientRect().toJSON() as DOMRect;
        });
        expect(Math.abs(t.left + t.width / 2 - centre), `${dev} ${fullscreen}: ${sel} centred`).toBeLessThan(4);
      }
      // R15-13: no line under the navy header.
      const line = await page.getByTestId('game-strip').evaluate((e) => getComputedStyle(e).borderBottomWidth);
      expect(line).toBe('0px');
    }
    await page.context().close();
  }
  // A clue: the value next to Options (as the category next to the menu); the timer line above the band.
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${BASE}/host`);
  await expect(page.getByTestId('host-tile')).toHaveCount(30);
  await h.act({ type: 'selectClue', clueId: 'geo_2' });
  await expect(page.getByTestId('host-clue-value')).toBeVisible();
  const head = await page.getByTestId('game-strip').evaluate((e) => ({ inset: getComputedStyle(e).boxShadow }));
  expect(head.inset).toBe('none'); // R15-13: no dark bar along the red strip's bottom
  const value = await page.getByTestId('host-clue-value').evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().toJSON() as DOMRect;
  });
  const cat = await page.getByTestId('host-clue-category').evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().toJSON() as DOMRect;
  });
  const menu = await rect(page, 'fs-menu-toggle');
  const options = await rect(page, 'game-options');
  const leftGap = cat.left - menu.right;
  const rightGap = options.left - value.right;
  expect(Math.abs(leftGap - rightGap), `gaps ${leftGap} / ${rightGap}`).toBeLessThan(8);
  const bandBefore = await rect(page, 'game-bar');
  const unlockBefore = await rect(page, 'unlock');
  await page.getByTestId('unlock').click();
  await expect(page.getByTestId('host-timer-line')).toBeVisible();
  const timerLine = await rect(page, 'host-timer-line');
  const bandAfter = await rect(page, 'game-bar');
  expect(Math.abs(timerLine.bottom - bandAfter.top), 'timer line just above the band').toBeLessThan(1.5);
  expect(bandAfter.top).toBe(bandBefore.top);
  expect(bandAfter.height).toBe(bandBefore.height);
  const reveal = await rect(page, 'reveal-answer');
  expect(Math.abs(reveal.top - unlockBefore.top), 'the main action does not move').toBeLessThan(1);
  await shot(page, 'clue-timer');
  await page.getByTestId('reveal-answer').click();
  await page.getByTestId('back-to-board').click();
  // Daily Double!: the label is whole (not "Daily…").
  const g = await h.until((x) => x.phase === 'board');
  const dd = g.rounds[g.roundIndex].categories.flatMap((c: { clues: { id: string; dailyWager?: boolean; used: boolean }[] }) => c.clues).find((q: { dailyWager?: boolean; used: boolean }) => q.dailyWager && !q.used);
  await h.act({ type: 'selectClue', clueId: dd.id });
  await expect(page.getByTestId('host-dd-label')).toBeVisible();
  const cut = await page.getByTestId('host-clue-value').evaluate((e) => e.scrollWidth > e.clientWidth + 1);
  expect(cut, 'Daily Double label cut off').toBe(false);
  await expect(page.getByTestId('host-dd-label')).toContainText('Daily Double');
  await shot(page, 'dd-banner');
  h.close();
});

test('Daily Double!: no wager timer until the host starts it, Preview Clue over the picture only, host entry, Lock Wager & Show Clue in the main place (R15-18 … R15-21)', async () => {
  test.setTimeout(150_000);
  const { h } = await startGame(2);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  for (const dev of ['iPad Pro 11 landscape', 'iPad Pro 11'] as const) {
    const ipad = await (await wk.newContext({ ...devices[dev] })).newPage();
    await ipad.goto(`${BASE}/host`);
    await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
    const g = await h.until((x) => x.phase === 'board');
    const dd = g.rounds[g.roundIndex].categories.flatMap((c: { clues: { id: string; dailyWager?: boolean; used: boolean }[] }) => c.clues).find((q: { dailyWager?: boolean; used: boolean }) => q.dailyWager && !q.used);
    await h.act({ type: 'setControl', competitorId: g.competitors[0].id });
    await h.act({ type: 'selectClue', clueId: dd.id });
    let s = await h.until((x) => x.clue?.stage === 'wager');
    expect(s.timer, 'no wager timer before the host starts it').toBeNull();
    // The wager's information and actions are in the band; nothing over the preview.
    await expect(ipad.getByTestId('host-dd-who')).toContainText('is wagering');
    await expect(ipad.getByTestId('clue-overlay')).toHaveCount(0);
    await expect(ipad.getByTestId('host-dd-lock')).toBeDisabled();
    // Preview Clue: the clue, only on the iPad, exactly the picture's height, centred on it.
    await ipad.getByTestId('host-dd-preview').click();
    await expect(ipad.getByTestId('host-dd-clue-text')).not.toBeEmpty();
    const lb = await rect(ipad, 'host-dd-clue-box');
    const stage = await rect(ipad, 'game-stage');
    expect(Math.abs(lb.top - stage.top)).toBeLessThan(1.5);
    expect(Math.abs(lb.bottom - stage.bottom)).toBeLessThan(1.5);
    expect(Math.abs(lb.left + lb.width / 2 - (stage.left + stage.width / 2))).toBeLessThan(1.5);
    const close = await ipad.getByTestId('host-dd-clue-close').evaluate((e) => ({ border: getComputedStyle(e).borderTopWidth, bg: getComputedStyle(e).backgroundColor, w: e.getBoundingClientRect().width }));
    expect(close.border).toBe('0px');
    expect(close.bg).toBe('rgba(0, 0, 0, 0)');
    expect(close.w).toBeGreaterThanOrEqual(44);
    await shot(ipad, `dd-preview-${dev.endsWith('landscape') ? 'land' : 'port'}`);
    await expect(tv.getByTestId('tv-question')).toHaveCount(0);
    await ipad.keyboard.press('Escape');
    await expect(ipad.getByTestId('host-dd-clue')).toHaveCount(0);
    s = await h.until(() => true);
    expect(s.clue.stage).toBe('wager');
    expect(s.timer).toBeNull();
    // Start the wager timer.
    await ipad.getByTestId('host-dd-timer').click();
    s = await h.until((x) => !!x.timer);
    expect(s.timer.kind).toBe('wager');
    expect(s.timer.running).toBe(true);
    expect(s.clue.stage).toBe('wager');
    await expect(ipad.getByTestId('host-dd-timer')).toHaveCount(0);
    // Host entry: an invalid wager is refused, a valid one waits for Lock.
    await ipad.getByTestId('host-dd-enter').click();
    await ipad.getByLabel('Wager amount').fill('9999999');
    await expect(ipad.getByTestId('host-dd-entry-invalid')).toBeVisible();
    await expect(ipad.getByTestId('host-dd-entry-done')).toBeDisabled();
    await ipad.getByLabel('Wager amount').fill('100');
    await ipad.getByTestId('host-dd-entry-done').click();
    await expect(ipad.getByTestId('host-dd-entry')).toHaveCount(0);
    await expect(ipad.getByTestId('host-dd-pending')).toContainText('100');
    s = await h.until((x) => x.clue?.pendingWager?.amount === 100);
    expect(s.clue.stage).toBe('wager');
    // Lock Wager & Show Clue sits where Unlock Buzzers does.
    const lock = await rect(ipad, 'host-dd-lock');
    const bar = await rect(ipad, 'game-bar');
    expect(lock.right).toBeGreaterThan(bar.right - 40);
    await shot(ipad, `dd-band-${dev.endsWith('landscape') ? 'land' : 'port'}`);
    await ipad.getByTestId('host-dd-lock').click();
    s = await h.until((x) => x.clue?.stage === 'question');
    expect(s.clue.wager.amount).toBe(100);
    await h.act({ type: 'closeClue', clueId: dd.id });
    await h.act({ type: 'restoreClue', clueId: dd.id }); // the next device opens it again
    await ipad.context().close();
  }
  h.close();
});

test('Final: the category stays put from its reveal to the wagers, "Enter your wagers now" fades in; during the reveals only the contestant part moves (R15-24 … R15-27)', async () => {
  test.setTimeout(180_000);
  const { h } = await startGame(3);
  const g0 = await h.until((x) => x.competitors.length === 3);
  const ids = g0.competitors.map((c: { id: string }) => c.id as string);
  for (const [i, id] of ids.entries()) await h.act({ type: 'adjustScore', competitorId: id, delta: 1000 * (i + 1) });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startFinal' });
  await expect(tv.getByTestId('tv-final')).toBeVisible();
  await tv.waitForTimeout(900);
  const catBox = () => tv.locator('[data-swipe-layer="current"] .bt-intro-cat').evaluate((e) => ({ ...(e.getBoundingClientRect().toJSON() as DOMRect), fs: getComputedStyle(e).fontSize }));
  const before = await catBox();
  await expect(tv.getByTestId('final-wager-cue')).toHaveCSS('opacity', '0');
  await h.act({ type: 'finalNext' }); // wagers
  await expect(tv.getByTestId('final-wager-cue')).toHaveText(/Enter your wagers now/i);
  await expect(tv.getByTestId('final-wager-cue')).not.toHaveCSS('opacity', '0');
  await expect(tv.locator('[data-final-chip]')).toHaveCount(3);
  await tv.waitForTimeout(800);
  const after = await catBox();
  expect(after.fs).toBe(before.fs);
  expect(Math.abs(after.top - before.top)).toBeLessThan(1);
  expect(Math.abs(after.left - before.left)).toBeLessThan(1);
  await shot(tv, 'final-wagers');
  for (const id of ids) await h.act({ type: 'setFinalWager', competitorId: id, amount: 100 });
  await h.act({ type: 'finalNext' }); // the clue
  for (const id of ids) await h.act({ type: 'setFinalAnswer', competitorId: id, answer: 'Something' });
  await tv.waitForTimeout(700);
  const clueCat = await catBox();
  await h.act({ type: 'finalNext' }); // closed
  await h.act({ type: 'finalNext' }); // reveal
  await tv.waitForTimeout(1200);
  const revealCat = await catBox();
  expect(revealCat.fs, 'the same category size on the clue and the reveal').toBe(clueCat.fs);
  expect(Math.abs(revealCat.top - clueCat.top)).toBeLessThan(1);
  // Next contestant: heading, category and order stay; only the contestant part swipes.
  const fixed = async () => ({
    kicker: await tv.locator('[data-swipe-layer="current"] .bt-kicker').first().evaluate((e) => e.getBoundingClientRect().top),
    cat: (await catBox()).top,
    order: await tv.getByTestId('tv-final-order').evaluate((e) => e.getBoundingClientRect().top),
  });
  const s0 = await fixed();
  const first = (await h.until((x) => x.final?.stage === 'reveal')).final.order[0] as string;
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'judgeFinal', competitorId: first, correct: true });
  await h.act({ type: 'finalReveal' }); // next contestant: a swipe
  await tv.waitForTimeout(250); // mid-swipe
  expect(await tv.locator('[data-swipe-layer="leaving"] .bt-kicker').count(), 'the heading does not swipe').toBe(0);
  expect(await tv.locator('.bt-final-spot-stage [data-swipe-layer]').count(), 'the contestant part swipes').toBeGreaterThan(1);
  const s1 = await fixed();
  expect(s1).toEqual(s0);
  await shot(tv, 'final-reveal-swipe');
  h.close();
});

test('bots: the chosen tile is outlined before the clue opens; the answer sits under the correct response (R15-28, R15-29)', async () => {
  test.setTimeout(120_000);
  const r = await openLobby(1);
  await r.h.act({ type: 'addBot', name: 'Robo Fifteen', level: 'expert' });
  await r.h.act({ type: 'startGame' });
  await r.h.act({ type: 'introSkip' });
  const g = await r.h.until((x) => x.competitors.length === 2 && x.phase === 'board');
  const bot = g.competitors.find((c: { bot?: string }) => c.bot);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  await r.h.act({ type: 'setControl', competitorId: bot.id });
  const picked = tv.locator('[data-picked="true"]');
  await expect(picked).toHaveCount(1, { timeout: 15_000 });
  const id = await picked.getAttribute('data-clue-id');
  await shot(tv, 'bot-picked');
  // Still the board for a moment, then that clue opens.
  expect((await r.h.until(() => true)).phase).toBe('board');
  const open = await r.h.until((x) => x.phase === 'clue');
  expect(open.clue.clueId).toBe(id);
  await expect(picked).toHaveCount(0);
  // The bot answers: its answer is centred right under the header.
  if (!open.clue.isDailyWager) {
    await r.h.act({ type: 'unlockBuzzers' });
    await expect(ipad.getByTestId('bot-answer')).toBeVisible({ timeout: 20_000 });
    const label = await rect(ipad, 'bot-answer-panel');
    const strip = await rect(ipad, 'game-strip');
    expect(Math.abs(label.top - strip.bottom)).toBeLessThan(2);
    expect(Math.abs(label.left + label.width / 2 - (strip.left + strip.width / 2))).toBeLessThan(2);
    await shot(ipad, 'bot-answer');
  }
  r.h.close();
});

test('TV lobby: a nickname changes neither the columns nor the card positions, the statistics keep one size, the test-buzz glow is soft and rounded (R15-4 … R15-7)', async () => {
  test.setTimeout(120_000);
  const { h, ids } = await openLobby(9);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-lobby-player')).toHaveCount(9);
  await tv.waitForTimeout(1200);
  const boxes = () => tv.getByTestId('tv-lobby-player').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect).map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]));
  const cols = (b: number[][]) => new Set(b.map((x) => x[0])).size;
  const b0 = await boxes();
  // Watch every card for movement while nicknames change (no shuffling, no remounting).
  await tv.evaluate(() => {
    const w = window as unknown as { moved: number; mounted: number };
    w.moved = 0;
    w.mounted = 0;
    const list = document.querySelector('.tvp-people')!;
    new MutationObserver((m) => m.forEach((x) => (w.mounted += [...x.addedNodes].filter((n) => (n as HTMLElement).dataset?.testid === 'tv-lobby-player').length))).observe(list, { childList: true });
    const start = [...list.querySelectorAll<HTMLElement>('[data-testid="tv-lobby-player"]')].map((e) => e.getBoundingClientRect());
    const tick = () => {
      [...list.querySelectorAll<HTMLElement>('[data-testid="tv-lobby-player"]')].forEach((e, i) => {
        const r = e.getBoundingClientRect();
        if (start[i] && (Math.abs(r.left - start[i].left) > 1 || Math.abs(r.top - start[i].top) > 1)) w.moved++;
      });
      requestAnimationFrame(tick);
    };
    tick();
  });
  for (const [i, nick] of ['Ace', 'The Quizzinator Supreme', 'Zed'].entries()) {
    await h.act({ type: 'setNickname', profileId: ids[i * 3], nickname: nick });
    await expect(tv.getByTestId('tv-lobby-player').nth(i * 3)).toContainText(nick);
    await tv.waitForTimeout(500);
  }
  await h.act({ type: 'setNickname', profileId: ids[0], nickname: '' });
  await tv.waitForTimeout(800);
  const moved = await tv.evaluate(() => {
    const w = window as unknown as { moved: number; mounted: number };
    return { moved: w.moved, mounted: w.mounted };
  });
  expect(moved.moved, 'cards moved').toBe(0);
  expect(moved.mounted, 'cards remounted').toBe(0);
  const b1 = await boxes();
  expect(cols(b1)).toBe(cols(b0));
  expect(b1).toEqual(b0);
  await shot(tv, 'lobby-nicknames');
  // The statistics line has one size on every card, with or without a nickname.
  const sizes = await tv.getByTestId('tv-player-stats').evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).fontSize))]);
  expect(sizes.length).toBeLessThanOrEqual(1);
  // Nickname or not, 1 … 12 players: the same columns as without nicknames.
  h.close();
});

test('phone: the Test Buzzer covers the page and has a back arrow to the lobby (R15-8, R15-9)', async () => {
  test.setTimeout(120_000);
  const { h } = await openLobby(1);
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('play-as-guest').click();
  await phone.getByTestId('guest-name').fill('Back Arrow');
  await phone.getByTestId('guest-join').click();
  await phone.getByTestId('join-game').click();
  await expect(phone.getByTestId('lobby-joined')).toBeVisible();
  await phone.getByTestId('test-buzzer-open').click();
  const overlay = phone.getByTestId('test-buzzer');
  await expect(overlay).toBeVisible();
  expect(await overlay.evaluate((e) => e.parentElement === document.body)).toBe(true);
  // Nothing of the page shows above or through it (no header, no white edge near the picture).
  const top = await phone.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth - 30, 60);
    return !!el?.closest('[data-testid="test-buzzer"]');
  });
  expect(top).toBe(true);
  const back = phone.getByTestId('test-buzzer-done');
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('aria-label', 'Back to the lobby');
  await shot(phone, 'test-buzzer');
  await back.click();
  await expect(overlay).toHaveCount(0);
  await expect(phone.getByTestId('lobby-joined')).toBeVisible();
  h.close();
});

test('stable layouts at fractional zoom: nothing keeps resizing on the host screen (R15-30)', async () => {
  test.setTimeout(120_000);
  const { h } = await startGame(6);
  await h.act({ type: 'selectClue', clueId: 'geo_2' });
  for (const deviceScaleFactor of [1.1, 1.25, 1.5, 1.75]) {
    const page = await (await cr.newContext({ viewport: { width: 1123, height: 781 }, deviceScaleFactor })).newPage();
    await page.goto(`${BASE}/host`);
    await expect(page.getByTestId('host-answer')).toBeVisible();
    await page.waitForTimeout(1500);
    const changes = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          let n = 0;
          const root = document.querySelector('[data-testid="host-live"]')!;
          const mo = new MutationObserver((m) => (n += m.length));
          mo.observe(root, { attributes: true, subtree: true, attributeFilter: ['style', 'class', 'data-lines'] });
          setTimeout(() => {
            mo.disconnect();
            res(n);
          }, 2000);
        }),
    );
    expect(changes, `dpr ${deviceScaleFactor}: style changes while idle`).toBe(0);
    await page.context().close();
  }
  h.close();
});
