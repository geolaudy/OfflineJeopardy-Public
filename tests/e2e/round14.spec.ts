// Round 14 — real-hardware playtest feedback: at most 12 players or teams (R14-1), host score cards
// with a constant section height (R14-2), TV scores fitted once to the widest possible score
// (R14-3), one Options menu in both views (R14-9), the full-screen menu sliding closed (R14-14), no
// buzzer glow on the host preview (R14-7), the preview's surroundings in the panel colour (R14-6),
// the Final's host controls (R14-15 … R14-22), the TV lobby join address (R14-26) and lobby player
// management (R14-28, R14-29).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r14-${name}.png` });
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
// The same names as round 13 (profile creation is rate-limited per address); every third is long.
const nameOf = (i: number) => `Thirteen ${String.fromCharCode(65 + i)}${i % 3 === 2 ? ' with a long name' : ''}`;

/** A solo lobby on the starter board with `n` players (profile ids returned too). */
async function openLobby(n: number) {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 14 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const existing = (await (await api.get('/api/profiles')).json()) as { id: string; name: string }[];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    let id = existing.find((p) => p.name === nameOf(i))?.id;
    if (!id) id = ((await (await api.post('/api/profiles', { data: { name: nameOf(i), color: COLORS[i % 8], avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } }).profile.id;
    await h.act({ type: 'addPlayer', profileId: id });
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

async function box(p: Page, id: string) {
  const b = await p.getByTestId(id).boundingBox();
  expect(b, id).not.toBeNull();
  return b!;
}

test('at most 12 players: the 13th player, guest or computer opponent is refused, and the iPad lobby says so (R14-1)', async () => {
  test.setTimeout(120_000);
  const { api, h } = await openLobby(12);
  const existing = (await (await api.get('/api/profiles')).json()) as { id: string; name: string }[];
  let extra = existing.find((p) => p.name === nameOf(12))?.id;
  if (!extra) extra = ((await (await api.post('/api/profiles', { data: { name: nameOf(12), color: '#16a34a', avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } }).profile.id;
  await expect(h.act({ type: 'addPlayer', profileId: extra })).rejects.toThrow(/full \(12 players\)/);
  await expect(h.act({ type: 'addBot', name: 'Robo Thirteen', level: 'easy' })).rejects.toThrow(/full/);
  const guest = await api.post('/api/guests', { data: { name: 'Late Guest' } });
  expect(guest.status()).toBe(409);
  expect((await guest.json()).error).toMatch(/full/);
  // The lobby shows the count, the notice, and no way to add another.
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('solo-count')).toContainText('12 / 12');
  await expect(ipad.getByTestId('game-full')).toBeVisible();
  await shot(ipad, 'lobby-full');
  // One leaves: a seat opens again.
  const g = await h.until((x) => x.competitors.length === 12);
  await h.act({ type: 'removeCompetitor', competitorId: g.competitors[11].id });
  await expect(ipad.getByTestId('game-full')).toHaveCount(0);
  await h.act({ type: 'addBot', name: 'Robo Twelve', level: 'medium' });
  await expect(ipad.getByTestId('solo-count')).toContainText('12 / 12');
  h.close();
});

// R14-2: the score section keeps one height whatever the number of players (two rows of up to six).
const sectionHeights: Record<string, number> = {};
for (const n of [1, 3, 6, 9, 12])
  test(`score cards: ${n} player(s) — one or two rows, constant section height, no clipped score, iPad portrait and landscape (R14-2, R14-3)`, async () => {
    test.setTimeout(150_000);
    const { h } = await startGame(n);
    const g = await h.until((x) => x.competitors.length === n);
    // A wide negative score: the card's fitted size must still show it whole.
    await h.act({ type: 'adjustScore', competitorId: g.competitors[n - 1].id, delta: -250_000 });
    for (const dev of ['iPad Pro 11 landscape', 'iPad Pro 11'] as const)
      for (const fullscreen of [false, true]) {
        const view = `${dev.endsWith('landscape') ? 'land' : 'port'}-${fullscreen ? 'fs' : 'emb'}`;
        const page = await (await wk.newContext({ ...devices[dev] })).newPage();
        await page.goto(`${BASE}/host`);
        await expect(page.getByTestId('host-score')).toHaveCount(n);
        if (fullscreen) await page.getByTestId('fullscreen-toggle').click();
        await page.waitForTimeout(700);
        await shot(page, `cards-${n}-${view}`);
        const scores = await box(page, 'host-scores');
        const cards = await page.getByTestId('host-score').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
        for (const c of cards) {
          expect(c.y, view).toBeGreaterThanOrEqual(scores.y - 1);
          expect(c.y + c.height, view).toBeLessThanOrEqual(scores.y + scores.height + 1);
        }
        // Rows: one up to six cards, two above that.
        const rows = new Set(cards.map((c) => Math.round(c.y))).size;
        expect(rows, view).toBe(n > 6 ? 2 : 1);
        // Every score is shown whole (no ellipsis, nothing cut off).
        const clipped = await page.locator('.host-score-value').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
        expect(clipped, view).toEqual([]);
        await expect(page.locator('.host-score-value').last()).toHaveText(/^−\$?250,000$/);
        // The same height for every number of players.
        const key = view;
        sectionHeights[key] ??= scores.height;
        expect(Math.abs(scores.height - sectionHeights[key]), `${view}: section height`).toBeLessThan(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.context().close();
      }
    h.close();
  });

test('TV scores: one font size for every podium, fitted to the widest possible score — a −$999,999 score fits (R14-3)', async () => {
  test.setTimeout(120_000);
  const { h } = await startGame(12);
  const g = await h.until((x) => x.competitors.length === 12);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('podium')).toHaveCount(12);
  await tv.waitForTimeout(800);
  const sizes = () => tv.getByTestId('score').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize));
  const before = await sizes();
  expect(new Set(before).size).toBe(1);
  await h.act({ type: 'adjustScore', competitorId: g.competitors[3].id, delta: -999_999 });
  await h.act({ type: 'adjustScore', competitorId: g.competitors[4].id, delta: 999_999 });
  await expect(tv.getByTestId('score').nth(3)).toHaveText('−$999,999', { timeout: 8000 });
  await tv.waitForTimeout(600);
  expect(await sizes()).toEqual(before); // a score change never changes the size
  const overflow = await tv.getByTestId('score').evaluateAll((els) =>
    els.filter((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const t = r.getBoundingClientRect();
      const b = e.getBoundingClientRect();
      return t.left < b.left - 1 || t.right > b.right + 1;
    }).length,
  );
  expect(overflow).toBe(0);
  await shot(tv, 'tv-scores-12');
  h.close();
});

test('Options: no page header during play, the same Game options in both views with Pause, Switch game and Close lobby; the full-screen menu slides closed (R14-9, R14-14)', async () => {
  test.setTimeout(120_000);
  const { h } = await startGame(3);
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${BASE}/host`);
  await expect(page.getByTestId('host-tile')).toHaveCount(30);
  await expect(page.getByTestId('nav-menu')).toBeHidden(); // the page header is hidden while playing
  for (const fullscreen of [false, true]) {
    if (fullscreen) await page.getByTestId('fullscreen-toggle').click();
    await page.getByTestId('game-options').click();
    const dlg = page.getByRole('dialog', { name: 'Game options' });
    await expect(dlg).toBeVisible();
    for (const id of ['option-pause', 'switch-game', 'close-lobby', 'option-end-game']) await expect(dlg.getByTestId(id)).toBeVisible();
    // Centred on the screen.
    const d = (await dlg.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(Math.abs(d.x + d.width / 2 - vw / 2)).toBeLessThan(4);
    await shot(page, `options-${fullscreen ? 'fs' : 'embedded'}`);
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  }
  // Full screen: the menu opens, then slides back out before it is removed.
  await page.getByTestId('fs-menu-toggle').click();
  await expect(page.getByTestId('fs-menu')).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(400);
  await page.getByTestId('fs-menu-close').click();
  await expect(page.getByTestId('fs-menu')).toHaveAttribute('data-state', 'closing');
  await expect(page.getByTestId('fs-menu')).toHaveCount(0);
  h.close();
});

test('clue: no buzzer glow on the host preview, the picture surroundings in the panel colour, the correct response centred in the band (R14-6, R14-7, R14-8)', async () => {
  test.setTimeout(120_000);
  const { h } = await startGame(3);
  const page = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await page.goto(`${BASE}/host`);
  await expect(page.getByTestId('host-tile')).toHaveCount(30);
  await h.act({ type: 'selectClue', clueId: 'geo_2' });
  await expect(page.getByTestId('clue-preview-box')).toBeVisible();
  await page.getByTestId('unlock').click();
  await page.waitForTimeout(900);
  const clue = page.frameLocator('[data-testid="clue-preview"] iframe');
  const glow = await clue.locator('[data-testid="tv-unlock-indicator"] > :not([role="status"])').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
  expect(glow).toBe(0);
  // R15-14: the clue panel's surface is a layer over the board's ground (its colour and grain).
  await expect(page.getByTestId('host-stage-panel')).toHaveAttribute('data-on', 'true');
  const bg = await page.getByTestId('host-stage-panel').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe('rgb(7, 20, 131)');
  // The correct response is centred in the header band.
  const strip = await box(page, 'game-strip');
  const answer = await page.getByTestId('host-answer').evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().toJSON() as DOMRect;
  });
  expect(Math.abs(answer.x + answer.width / 2 - (strip.x + strip.width / 2))).toBeLessThan(strip.width * 0.03);
  await shot(page, 'clue-unlocked');
  h.close();
});

test('Final: Preview Clue (text only), the bubbles open entry for a player, chip outlines on the TV, results without the label (R14-15 … R14-22)', async () => {
  test.setTimeout(180_000);
  const { h } = await startGame(2);
  const g0 = await h.until((x) => x.competitors.length === 2);
  const [A, B] = g0.competitors.map((c: { id: string }) => c.id as string);
  await h.act({ type: 'adjustScore', competitorId: A, delta: 1000 });
  await h.act({ type: 'adjustScore', competitorId: B, delta: 2000 });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  await h.act({ type: 'startFinal' });
  await expect(ipad.getByTestId('host-final')).toBeVisible();
  // R14-16: no category or "Final Jeopardy!" in the header band.
  await expect(ipad.getByTestId('game-strip')).not.toContainText('Final Jeopardy');
  // R14-17: Preview Clue — the clue's text, TV-styled, only on the iPad.
  await ipad.getByTestId('final-preview-clue').click();
  const lightbox = ipad.getByTestId('final-clue-preview');
  await expect(lightbox).toBeVisible();
  await expect(ipad.getByTestId('final-clue-preview-text')).not.toBeEmpty();
  await expect(lightbox.locator('img, audio, video')).toHaveCount(0);
  await shot(ipad, 'final-preview-clue');
  await expect(tv.getByTestId('final-clue-preview-text')).toHaveCount(0);
  await ipad.getByTestId('final-clue-preview-close').click();
  await expect(lightbox).toHaveCount(0);
  // R14-18: wagers — the host taps a bubble and enters a wager for that player.
  await h.act({ type: 'finalNext' });
  await expect(ipad.getByTestId('final-status')).toHaveCount(2);
  await ipad.getByTestId('final-status').first().click();
  const sheet = ipad.getByTestId('final-entry-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Wager for this player').fill('500');
  await sheet.getByTestId('final-entry-save').click();
  await expect(sheet).toHaveCount(0);
  const wagered = await h.until((x) => x.final.entries.some((e: { hasWager: boolean }) => e.hasWager));
  expect(wagered.final.entries.filter((e: { hasWager: boolean }) => e.hasWager)).toHaveLength(1);
  await expect(ipad.getByTestId('final-status').first()).toHaveAttribute('data-done', 'true');
  await h.act({ type: 'setFinalWager', competitorId: A, amount: 400 });
  await h.act({ type: 'setFinalWager', competitorId: B, amount: 400 });
  await h.act({ type: 'finalNext' }); // the clue; answers open
  await expect(ipad.getByTestId('final-status')).toHaveCount(2);
  await ipad.getByTestId('final-status').nth(1).click();
  await sheet.getByLabel('Answer for this player').fill('What is Budapest?');
  await sheet.getByTestId('final-entry-save').click();
  await h.until((x) => x.final.entries.filter((e: { submitted: boolean }) => e.submitted).length === 1);
  await h.act({ type: 'setFinalAnswer', competitorId: A, answer: 'Vienna' });
  await h.act({ type: 'setFinalAnswer', competitorId: B, answer: 'Budapest' });
  await h.act({ type: 'finalNext' }); // closed
  await h.act({ type: 'finalNext' }); // reveal
  // R14-20: the current contestant's chip is yellow, judged ones green / red, the rest grey.
  const chips = tv.getByTestId('tv-final-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute('data-state', 'current');
  await expect(chips.nth(1)).toHaveAttribute('data-state', 'waiting');
  const first = (await h.until((x) => x.final.stage === 'reveal')).final.order[0] as string;
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'judgeFinal', competitorId: first, correct: first === B });
  await expect(chips.first()).toHaveAttribute('data-state', first === B ? 'correct' : 'incorrect');
  await expect(chips.first().locator('svg')).toHaveCount(0);
  await shot(tv, 'final-chips');
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'finalReveal' });
  await h.act({ type: 'finalReveal' });
  const second = first === A ? B : A;
  await h.act({ type: 'judgeFinal', competitorId: second, correct: second === B });
  await h.act({ type: 'finalNext' }); // done: the results
  await expect(tv.getByTestId('tv-final-card')).toHaveCount(2);
  await expect(tv.getByTestId('tv-final')).not.toContainText('Correct response');
  await shot(tv, 'final-results');
  h.close();
});

test('TV lobby: "or open" on its own line, centred above the join address (R14-26)', async () => {
  test.setTimeout(60_000);
  const { h } = await openLobby(2);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const url = tv.getByTestId('tv-join-url');
  await expect(url).toContainText('/join');
  const or = (await url.locator('.tvp-qr-or').boundingBox())!;
  const addr = (await url.locator('.tvp-qr-addr').boundingBox())!;
  const qr = (await tv.getByTestId('tv-join-card').boundingBox())!;
  expect(or.y + or.height).toBeLessThanOrEqual(addr.y + 1);
  const centre = qr.x + qr.width / 2;
  expect(Math.abs(or.x + or.width / 2 - centre)).toBeLessThan(4);
  expect(await url.locator('.tvp-qr-or').textContent()).toBe('or open');
  h.close();
});

test('lobby: tapping a player opens nickname, profile and editor — the nickname reaches the TV; the editor has no nickname field (R14-28, R14-29)', async () => {
  test.setTimeout(120_000);
  const { api, h } = await openLobby(2);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await ipad.getByRole('button', { name: `Manage ${nameOf(0)}` }).click();
  const sheet = ipad.getByTestId('lobby-player-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('lobby-nickname-input').fill('Ace of Clues');
  await sheet.getByTestId('lobby-nickname-save').click();
  await expect(tv.getByTestId('tv-lobby-player').filter({ hasText: 'Ace of Clues' })).toBeVisible();
  await expect(sheet).toHaveCount(0); // saving closes the sheet
  // The profile editor: name, colour, picture and PIN, but no nickname (that is per game).
  await ipad.getByTestId('lobby-player-open').first().click();
  await shot(ipad, 'lobby-sheet');
  await sheet.getByTestId('lobby-edit-profile').click();
  await expect(ipad.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(ipad.getByLabel(/Nickname/)).toHaveCount(0);
  await ipad.keyboard.press('Escape');
  // A guest: nickname only.
  const guest = await api.post('/api/guests', { data: { name: 'Couch Guest' } });
  expect(guest.ok()).toBe(true);
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.send(JSON.stringify({ t: 'hello', role: 'player', token: (await guest.json()).token }));
  ws.send(JSON.stringify({ t: 'join' }));
  await h.until((x) => x.competitors.length === 3);
  await ipad.getByRole('button', { name: 'Manage Couch Guest' }).click();
  await expect(ipad.getByTestId('lobby-player-sheet')).toBeVisible();
  await expect(ipad.getByTestId('lobby-nickname-input')).toBeVisible();
  await expect(ipad.getByTestId('lobby-view-profile')).toHaveCount(0);
  await expect(ipad.getByTestId('lobby-edit-profile')).toHaveCount(0);
  ws.close();
  h.close();
});
