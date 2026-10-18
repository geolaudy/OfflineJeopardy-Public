// Round 11 — milestone A:
// - a Buzzinga picture clue's text is imported as the clue text (editor + TV), not a caption (R11-2);
// - one "buzzers open" glow on the TV and the iPad preview — no second line above the timer (R11-6);
// - no "buzzed in" card on the iPad preview (the TV keeps it) (R11-5);
// - the host's timer is a line along the top of the control band; the controls are centred (R11-3.7, R11-4).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { BoardContent } from '../../src/shared/game';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r11-${name}.png` });
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
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

/** A two-player solo game on `boardId`, at the board. */
async function startGame(api: Awaited<ReturnType<typeof setup>>['api'], host: string, H: Record<string, string>, boardId: string, tag: string) {
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 11 night' } });
  await api.post('/api/games', { headers: H, data: { boardId, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const [i, name] of ['Eleven Ann', 'Eleven Bo'].entries()) {
    const p = (await (await api.post('/api/profiles', { data: { name: `${name} ${tag}`, color: i ? '#2563eb' : '#dc2626', avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
  }
  const g = await h.until((x) => x.competitors.length === 2);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  return { h, ids: g.competitors.map((c: { id: string }) => c.id) as string[] };
}

test('Buzzinga picture clue: its text is the clue text in the editor and on the TV, not a caption (R11-2)', async () => {
  test.setTimeout(120_000);
  const { api, host, H } = await setup();
  const doc = {
    name: 'Buzzinga Pictures R11',
    rounds: [
      [
        {
          category: 'Planets',
          clues: [
            { text: 'saturn picture.png', answer: 'Saturn', type: 'IMAGE', answerType: 'TEXT', bottomCaption: 'Name this ringed planet' },
            { text: 'The red planet', answer: 'Mars', type: 'TEXT', answerType: 'TEXT' },
          ],
        },
      ],
    ],
  };
  const ins = await (await api.post('/api/import/inspect', { headers: H, data: { kind: 'file', name: 'pictures.json', text: JSON.stringify(doc) } })).json();
  expect(ins.source.id).toBe('buzzinga');
  const com = await (await api.post('/api/import/commit', { headers: H, data: { importId: ins.importId } })).json();
  const boardId = com.boardId as string;
  // (The picture reference is not downloadable — the test server is offline — so put a local one in.)
  const pic = (await (await api.post('/api/media', { headers: H, multipart: { file: { name: 'saturn.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#a16207' } }).png().toBuffer() } } })).json()) as { url: string };
  const rec = await (await api.get(`/api/boards/${boardId}`, { headers: H })).json();
  const content = rec.content as BoardContent;
  const clue = content.rounds[0].categories[0].clues[0];
  expect(clue.question).toBe('Name this ringed planet');
  expect((clue.media ?? []).some((m) => m.caption)).toBe(false);
  clue.media = [{ kind: 'image', url: pic.url }];
  await api.put(`/api/boards/${boardId}`, { headers: H, data: { title: rec.title, description: rec.description ?? '', tags: rec.tags ?? [], content } });

  // Reopened in the editor: the text is in the clue text field; the caption field is empty.
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/boards/${boardId}`);
  await pc.getByRole('button', { name: /^Edit Planets 200/ }).click();
  await expect(pc.getByTestId('clue-question')).toHaveAttribute('data-value', 'Name this ringed planet');
  await expect(pc.getByTestId('clue-question')).toHaveText('Name this ringed planet');
  await expect(pc.getByTestId('clue-media').getByPlaceholder(/Caption/)).toHaveValue('');
  await shot(pc, 'buzzinga-editor');

  // Gameplay: the picture with the text under it, as a clue made by hand.
  const { h } = await startGame(api, host, H, boardId, 'imp');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'selectClue', clueId: clue.id });
  await expect(tv.getByTestId('clue-text')).toHaveText('Name this ringed planet');
  await expect(tv.getByTestId('clue-image')).toHaveAttribute('src', pic.url);
  await expect(tv.getByTestId('clue-caption')).toHaveCount(0);
  await tv.waitForTimeout(800);
  await shot(tv, 'buzzinga-tv');
  h.close();
});

test('one buzzers-open glow; no buzzed-in card on the iPad preview; host timer line in the centred control band (R11-3.7, R11-4, R11-5, R11-6)', async () => {
  test.setTimeout(150_000);
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const { h, ids } = await startGame(api, host, H, boards.find((b) => b.title === 'Starter Trivia Night')!.id, 'glow');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await h.act({ type: 'selectClue', clueId: 'hist_3' });
  await expect(ipad.getByTestId('clue-preview-box')).toBeVisible();
  // Centred controls: the bar's content is centred in the band.
  const centred = async () => {
    const band = (await ipad.getByTestId('game-bar').boundingBox())!;
    const inner = (await ipad.getByTestId('clue-footer').boundingBox())!;
    return Math.abs(inner.y + inner.height / 2 - (band.y + band.height / 2));
  };
  expect(await centred()).toBeLessThan(3);
  await ipad.getByTestId('unlock').click();
  await h.act({ type: 'timerStart', kind: 'buzz', seconds: 30 });
  // One glow on the TV: the bottom line glows, the 7vh box around it does not.
  const ind = tv.locator('.bt-ind-bottom');
  await expect(ind).toHaveCount(1);
  expect(await ind.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
  expect(await ind.evaluate((e) => getComputedStyle(e, '::after').boxShadow)).not.toBe('none');
  // The host's timer line: in the band, along its top edge; the preview has no TV timer bar.
  await expect(ipad.getByTestId('host-timer-line')).toBeVisible();
  const line = (await ipad.getByTestId('host-timer-line').boundingBox())!;
  const band = (await ipad.getByTestId('game-bar').boundingBox())!;
  expect(Math.abs(line.y - band.y)).toBeLessThan(2);
  expect(line.width).toBeGreaterThan(band.width - 2);
  const frame = ipad.frameLocator('[data-testid="clue-preview"] iframe');
  await expect(frame.getByTestId('tv-timer')).toBeHidden();
  await expect(tv.getByTestId('tv-timer')).toBeVisible();
  expect(await centred()).toBeLessThan(3);
  const box0 = (await ipad.getByTestId('clue-preview-box').boundingBox())!;
  await tv.waitForTimeout(1500);
  await shot(tv, 'tv-buzzers-open');
  await shot(ipad, 'ipad-buzzers-open');

  // A buzz: the TV shows the buzzed-in card and the podium glow; the iPad preview shows no card.
  await h.act({ type: 'hostBuzz', competitorId: ids[0] });
  await expect(tv.getByTestId('buzz-winner')).toBeVisible();
  await expect(tv.locator('.bt-podium.is-winner')).toHaveCount(1);
  await expect(tv.getByTestId('tv-unlock-indicator')).toHaveCount(0);
  await expect(frame.getByTestId('buzz-winner')).toHaveCount(1);
  await expect(frame.getByTestId('buzz-winner')).toBeHidden();
  await expect(ipad.getByTestId('host-winner')).toBeVisible(); // who buzzed: on the band
  expect(await centred()).toBeLessThan(3);
  expect((await ipad.getByTestId('clue-preview-box').boundingBox())!).toEqual(box0);
  await tv.waitForTimeout(800);
  await shot(tv, 'tv-buzzed');
  await shot(ipad, 'ipad-buzzed');
  // Wrong → buzzers open again → the second player buzzes: still one glow at a time.
  await ipad.getByTestId('incorrect').click();
  await h.until((g) => g.buzzer.status !== 'buzzed');
  if ((await h.until(() => true)).buzzer.status === 'locked') await ipad.getByTestId('unlock').click();
  await h.act({ type: 'hostBuzz', competitorId: ids[1] });
  await expect(tv.locator('.bt-podium.is-winner')).toHaveCount(1);
  await expect(tv.getByTestId('tv-unlock-indicator')).toHaveCount(0);
  h.close();
});

/** Width ÷ height of the TV's presentation area (16:9 minus the 14 % score strip). */
const STAGE = 16 / 9 / 0.86;

for (const [label, browserName, ctxOpts] of [
  ['iPad landscape', 'webkit', { ...devices['iPad Pro 11 landscape'] }],
  ['iPad portrait', 'webkit', { ...devices['iPad Pro 11'] }],
  ['iPhone landscape', 'webkit', { ...devices['iPhone 13 landscape'] }],
  ['wide desktop', 'chromium', { viewport: { width: 2560, height: 1080 } }],
] as const) {
  test(`host full screen and embedded preview share one fitting: ${label} (R11-3, R11-8)`, async () => {
    test.setTimeout(150_000);
    const { api, host, H } = await setup();
    const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
    const { h, ids } = await startGame(api, host, H, boards.find((b) => b.title === 'Starter Trivia Night')!.id, label.slice(0, 4));
    const browser = browserName === 'webkit' ? wk : cr;
    const ipad = await (await browser.newContext(ctxOpts)).newPage();
    await ipad.goto(`${BASE}/host`);
    const vw = ipad.viewportSize()!;
    const box = async (id: string) => (await ipad.getByTestId(id).first().boundingBox())!;
    /** The fitting rules: strip / blue stage / band stacked over the frame's whole width; the TV area at the TV's proportions, inside the frame. */
    const check = async (frameId: string, what: string) => {
      const f = await box(frameId);
      const strip = await box('game-strip');
      const stage = await box('game-stage');
      const bar = await box('game-bar');
      expect(Math.abs(stage.width / stage.height - STAGE), `${what}: TV proportions`).toBeLessThan(0.02);
      expect(Math.abs(strip.width - f.width), `${what}: strip spans the frame`).toBeLessThan(1.5);
      expect(Math.abs(bar.width - f.width), `${what}: band spans the frame`).toBeLessThan(1.5);
      expect(stage.x).toBeGreaterThanOrEqual(f.x - 0.5);
      expect(stage.x + stage.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
      expect(stage.y).toBeGreaterThanOrEqual(strip.y + strip.height - 0.5); // under the red band
      expect(stage.y + stage.height).toBeLessThanOrEqual(f.y + f.height - 79); // above the controls
      expect(Math.abs(stage.x + stage.width / 2 - (f.x + f.width / 2)), `${what}: centred`).toBeLessThan(1.5);
      expect(await ipad.getByTestId('game-bar').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `${what}: no horizontal overflow`).toBe(true);
      return f;
    };
    await expect(ipad.getByTestId('host-board-box')).toBeVisible();
    await ipad.waitForTimeout(300);
    const board = await check('host-board-box', 'board');
    await h.act({ type: 'selectClue', clueId: 'geo_2' });
    await expect(ipad.getByTestId('clue-preview-box')).toBeVisible();
    await ipad.waitForTimeout(300);
    const clue = await check('clue-preview-box', 'clue');
    expect(clue).toEqual(board); // the same frame in every state
    await ipad.getByTestId('unlock').click();
    await h.act({ type: 'timerStart', kind: 'buzz', seconds: 60 });
    const before = (await h.until((x) => x.timer?.durationMs === 60_000)).timer;
    expect(before?.startedAt).toBeTruthy();
    await shot(ipad, `${label.replace(' ', '-')}-embedded`);

    // Full screen: the same rules over the whole screen; nothing about the game changes.
    await ipad.getByTestId('fullscreen-toggle').click();
    await expect(ipad.getByTestId('host-live')).toHaveAttribute('data-fullscreen', 'true');
    await expect(ipad.getByTestId('fullscreen-toggle')).toHaveAccessibleName('Exit Fullscreen');
    await ipad.waitForTimeout(400);
    const full = await check('clue-preview-box', 'full screen');
    expect(full.width).toBeGreaterThan(vw.width - 40); // the whole width (minus the page margin)
    expect(full.height).toBeGreaterThan(clue.height - 1);
    const stageFull = await box('game-stage');
    // Wider than the TV's proportions: blue at the sides, the content not stretched.
    if (full.width / (full.height - 168) > STAGE + 0.05) expect(stageFull.width).toBeLessThan(full.width - 20);
    await expect(ipad.getByTestId('answer-banner')).toBeVisible();
    await expect(ipad.getByTestId('host-timer-line')).toBeVisible();
    const during = await h.until(() => true);
    expect(during.clue?.clueId).toBe('geo_2');
    expect(during.buzzer.status).toBe('open');
    expect(during.timer?.startedAt).toBe(before?.startedAt); // the timer was not restarted
    await shot(ipad, `${label.replace(' ', '-')}-fullscreen`);
    // The host can play from full screen: a buzz, Correct.
    await h.act({ type: 'hostBuzz', competitorId: ids[0] });
    await ipad.getByTestId('correct').click();
    await expect(ipad.getByTestId('host-live')).toHaveAttribute('data-fullscreen', 'true');
    const fullAfter = await check('clue-preview-box', 'full screen after judging');
    expect(fullAfter).toEqual(full);

    // Exit (the button; Esc on a desktop): back to the embedded frame, same place and size.
    if (browserName === 'chromium') await ipad.keyboard.press('Escape');
    else await ipad.getByTestId('fullscreen-toggle').click();
    await expect(ipad.getByTestId('host-live')).toHaveAttribute('data-fullscreen', 'false');
    await ipad.waitForTimeout(400);
    // (Same size and place; the page may sit scrolled where the clicks above scrolled it.)
    const back = await check('clue-preview-box', 'after exit');
    expect([back.x, back.width, back.height]).toEqual([clue.x, clue.width, clue.height]);
    const after = await h.until(() => true);
    expect(after.clue?.clueId).toBe('geo_2');
    expect(after.competitors.find((c: { id: string }) => c.id === ids[0]).score).toBeGreaterThan(0);
    h.close();
  });
}

test('host web app: manifest keeps every page in the app; one header rule and safe-area top on every page (R11-7)', async () => {
  test.setTimeout(150_000);
  const { api, H } = await setup();
  // The manifests: scope "/" (every page of the app stays in the installed app), standalone.
  for (const [file, start] of [['host.webmanifest', '/host'], ['join.webmanifest', '/join']]) {
    const r = await api.get(`/${file}`);
    expect(r.status()).toBe(200);
    const m = await r.json();
    expect(m).toMatchObject({ scope: '/', start_url: start, display: 'standalone' });
    for (const icon of m.icons) expect((await api.get(icon.src)).status()).toBe(200);
  }
  expect((await api.get('/apple-touch-icon.png')).status()).toBe(200);

  const ctx = await cr.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const pc = await ctx.newPage();
  // A status bar 24 px tall (as on an iPad web app), where the browser can emulate it.
  const cdp = await ctx.newCDPSession(pc);
  const inset = await cdp
    .send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { top: 24, left: 0, bottom: 0, right: 0 } } as never)
    .then(() => 24)
    .catch(() => 0);
  await pc.goto(`${BASE}/host`);
  await expect(pc.locator('link[rel="manifest"]')).toHaveAttribute('href', '/host.webmanifest');
  await expect(pc.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  const nav = pc.getByTestId('host-nav');
  const title = nav.getByText('OfflineJeopardy', { exact: true });
  const tops: Record<string, number> = {};
  for (const [name, path] of [
    ['Home', '/host'],
    ['Boards', '/host/boards'],
    ['Players', '/host/players'],
    ['Teams', '/host/teams'],
    ['Leaderboards', '/host/leaderboard'],
    ['History', '/host/history'],
    ['Settings', '/host/settings'],
    ['Help', '/host/help'],
  ] as const) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(pc).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`));
    expect(ctx.pages()).toHaveLength(1); // nothing opens in another window / browser context
    await pc.waitForTimeout(200);
    tops[name] = (await title.boundingBox())!.y;
    // The page area clears the status bar on every page (Boards included).
    expect(await pc.getByTestId('host-main').evaluate((e) => parseFloat(getComputedStyle(e).paddingTop))).toBeGreaterThanOrEqual(inset - 0.5);
    if (name === 'Boards') await shot(pc, 'pwa-boards');
  }
  // The title sits in the same place on every page, below the status bar with a margin.
  for (const [name, y] of Object.entries(tops)) expect(Math.abs(y - tops.Home), name).toBeLessThan(1);
  expect(tops.Boards).toBeGreaterThanOrEqual(inset + 12 - 1);
  // The board editor opens and closes inside the app.
  await nav.getByRole('link', { name: 'Boards', exact: true }).click();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await pc.goto(`${BASE}/host/boards/${boards[0].id}`);
  await expect(title).toBeVisible();
  expect(Math.abs((await title.boundingBox())!.y - tops.Home)).toBeLessThan(1);
  await pc.goBack();
  await expect(pc).toHaveURL(/\/host\/boards$/);
  // The player pages bring their own manifest (a phone's Home Screen icon opens the portal).
  await pc.goto(`${BASE}/join`);
  await expect(pc.locator('link[rel="manifest"]')).toHaveAttribute('href', '/join.webmanifest');
  await ctx.close();
});

test('Final Jeopardy!: time up keeps answering open until the host closes it; phones say so (R11-9)', async () => {
  test.setTimeout(150_000);
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Final close night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  ipad.on('dialog', (d) => void d.accept());
  await ipad.goto(`${BASE}/host`);
  // The rules: "When I close them" is the default.
  await ipad.getByTestId('nav-menu').click();
  await ipad.getByRole('button', { name: /Rules & timers/ }).click();
  await ipad.getByRole('button', { name: 'Advanced rules' }).click();
  await expect(ipad.getByTestId('rule-final-close')).toHaveValue('host');
  await ipad.getByRole('dialog', { name: 'Rules & timers' }).getByRole('button', { name: 'Close' }).click();
  // Two phones join.
  const phones: Page[] = [];
  for (const name of ['Close Ann', 'Close Bo']) {
    const me = (await (await api.post('/api/profiles', { data: { name, color: '#16a34a', avatar: 'owl', pin: '1357' } })).json()) as { token: string };
    const p = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
    await p.addInitScript((t) => localStorage.setItem('oj.profileToken', t), me.token);
    await p.goto(`${BASE}/join`);
    await p.getByTestId('join-game').click();
    await expect(p.getByTestId('lobby-joined')).toBeVisible();
    phones.push(p);
  }
  const g = await h.until((x) => x.competitors.length === 2);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  for (const c of g.competitors) await h.act({ type: 'adjustScore', competitorId: c.id, delta: 500, note: 't' });
  const rules = (await h.until(() => true)).rules;
  await h.act({ type: 'updateRules', rules: { ...rules, timers: { ...rules.timers, finalSeconds: 3 } } });
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' });
  for (const p of phones) {
    await p.getByLabel('Your wager').fill('100');
    await p.getByTestId('phone-final-wager-submit').click();
    await expect(p.getByTestId('phone-final-wager-done')).toBeVisible();
  }
  await ipad.getByTestId('final-next').click(); // lock wagers & show the clue
  await phones[0].getByTestId('phone-final-answer').fill('Budapest');
  await phones[0].getByTestId('phone-final-answer-submit').click();
  // Time runs out: answering stays open — the phones and the host say so.
  for (const p of phones) await expect(p.getByTestId('phone-final-timeup')).toBeVisible({ timeout: 8000 });
  await expect(phones[1].getByTestId('phone-final-timeup')).toContainText('waiting for the host to close answering');
  await expect(ipad.getByTestId('final-bar')).toContainText("Time's up — answering stays open until you close it: 1 of 2 in.");
  await expect(ipad.getByTestId('final-next')).toHaveText('Close Answer Submissions');
  await shot(phones[1], 'final-timeup-phone');
  await shot(ipad, 'final-timeup-ipad');
  // A late answer from the second phone is taken.
  await phones[1].getByTestId('phone-final-answer').fill('Vienna');
  await phones[1].getByTestId('phone-final-answer-submit').click();
  await expect(ipad.getByTestId('final-status').filter({ hasText: 'Answered ✓' })).toHaveCount(2);
  // The host closes answering: every phone shows it closed, with its answer.
  await ipad.getByTestId('final-next').click();
  await expect(ipad.getByTestId('final-begin-reveal')).toBeVisible();
  await expect(phones[0].getByTestId('phone-final-locked')).toContainText('Budapest');
  await expect(phones[1].getByTestId('phone-final-locked')).toContainText('Vienna');
  for (const p of phones) await expect(p.getByTestId('phone-final-answer')).toHaveCount(0);
  h.close();
});
