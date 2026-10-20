// Round 5 milestone E (R5-12 … R5-14): hosting on the iPad (WebKit = Safari engine).
// - Category introduction: live TV preview, Previous Category, direct jump (one swipe, direction
//   from current vs destination), Auto / Stop Auto.
// - Board: replica of the TV board, "{Player} is choosing a clue", no "Picks next".
// - Clue: answer banner, large clue, footer flow Unlock → buzz → Correct/Incorrect → Return to
//   Board; Reveal Answer when nobody buzzes (with and without a timer); private answer lightbox.
// Screenshots (landscape + portrait iPad Pro 11) go to test-results/screens/ipad-*.png.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import { hostSocket } from './hostSocket';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/ipad-${name}.png` });
const LANDSCAPE = devices['iPad Pro 11 landscape'];
const PORTRAIT = { width: 834, height: 1194 };
let wk: Browser;
let cr: Browser;

test.beforeAll(async () => {
  wk = await webkit.launch();
  cr = await chromium.launch();
});
test.afterEach(async () => {
  for (const b of [wk, cr]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await wk?.close();
  await cr?.close();
});

async function setup(api: APIRequestContext, opts: { mode?: 'solo' | 'team'; boardId?: string } = {}) {
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name: 'iPad night' } });
  const boardId = opts.boardId ?? ((await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[]).find((b) => b.title === 'Starter Trivia Night')!.id;
  await api.post('/api/games', { headers: H, data: { boardId, mode: opts.mode ?? 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  return { H, h, host };
}
const mkProfile = async (api: APIRequestContext, name: string) => (await (await api.post('/api/profiles', { data: { name, color: '#1d4ed8', avatar: 'owl', pin: '1357' } })).json()) as { token: string; profile: { id: string } };

test('category introduction: live preview, Previous, direct jump, Auto and Stop Auto (R5-12)', async () => {
  test.setTimeout(120_000);
  const api = await request.newContext({ baseURL: BASE });
  const { H, h } = await setup(api);
  const ivy = await mkProfile(api, 'Intro Ivy');
  await h.act({ type: 'addPlayer', profileId: ivy.profile.id });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...LANDSCAPE })).newPage();
  await ipad.goto(`${BASE}/host`);
  await ipad.getByTestId('start-game').click();

  const intro = tv.getByTestId('intro');
  const preview = ipad.frameLocator('iframe[title="TV preview"]');
  await expect(ipad.getByTestId('intro-controls')).toBeVisible();
  await expect(ipad.getByTestId('intro-prev')).toBeDisabled(); // on the round title card
  await expect(ipad.getByTestId('intro-preview')).toHaveAttribute('data-ready', 'true');
  await expect(preview.getByTestId('intro')).toHaveAttribute('data-step', '-1');

  await ipad.getByTestId('intro-next').click();
  await expect(intro).toHaveAttribute('data-step', '0');
  await expect(preview.getByTestId('intro')).toHaveAttribute('data-step', '0');
  await expect(preview.getByText('History', { exact: true })).toBeVisible(); // follows the live state
  await ipad.waitForTimeout(900);
  await shot(ipad, 'landscape-intro');

  // Direct jump forward: one swipe from the right, straight to category 4.
  const cats = ipad.getByTestId('intro-cat');
  await expect(cats).toHaveCount(6);
  const fourth = (await cats.nth(3).textContent())!.trim();
  await cats.nth(3).click();
  await expect(intro).toHaveAttribute('data-step', '3');
  await expect(intro).toHaveAttribute('data-dir', 'forward');
  await expect(ipad.getByTestId('intro-now')).toContainText('Category 4 of 6');
  await expect(tv.getByText(fourth, { exact: true })).toBeVisible();
  await expect(cats.nth(3)).toHaveAttribute('aria-current', 'step');

  // Previous: one step back, entering from the left.
  await ipad.getByTestId('intro-prev').click();
  await expect(intro).toHaveAttribute('data-step', '2');
  await expect(intro).toHaveAttribute('data-dir', 'back');
  await expect(preview.getByTestId('intro')).toHaveAttribute('data-dir', 'back');
  // Jump back to the first category.
  await cats.nth(0).click();
  await expect(intro).toHaveAttribute('data-step', '0');
  await expect(intro).toHaveAttribute('data-dir', 'back');
  // A TV that reconnects mid-introduction shows the current category (no replayed swipe).
  await tv.reload();
  await expect(tv.getByTestId('intro')).toHaveAttribute('data-step', '0');
  await expect(tv.getByText('History', { exact: true })).toBeVisible();

  // Auto: the server advances every 3.5 s; Stop Auto keeps the current category.
  await ipad.getByTestId('intro-auto').click();
  await expect(ipad.getByTestId('intro-stop-auto')).toBeVisible();
  await expect(ipad.getByTestId('intro-now')).toContainText('automatic');
  await expect(intro).toHaveAttribute('data-step', '1', { timeout: 6000 });
  await ipad.getByTestId('intro-stop-auto').click();
  await expect(ipad.getByTestId('intro-auto')).toBeVisible();
  await expect(ipad.getByTestId('intro-now')).not.toContainText('automatic');
  await tv.waitForTimeout(4500); // longer than one automatic step
  await expect(intro).toHaveAttribute('data-step', '1');
  // A Previous tap during auto also takes over: nothing advances afterwards.
  await ipad.getByTestId('intro-auto').click();
  await expect(ipad.getByTestId('intro-stop-auto')).toBeVisible();
  await ipad.getByTestId('intro-prev').click();
  await expect(intro).toHaveAttribute('data-step', '0');
  await expect(ipad.getByTestId('intro-auto')).toBeVisible();
  await tv.waitForTimeout(4500);
  await expect(intro).toHaveAttribute('data-step', '0');
  const g = await h.until(() => true);
  expect(g.intro).toMatchObject({ step: 0, auto: false });

  await ipad.setViewportSize(PORTRAIT);
  await ipad.waitForTimeout(500);
  await shot(ipad, 'portrait-intro');
  await ipad.getByTestId('intro-skip').click();
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});

test('board replica and the clue footer flow on the iPad (R5-13, R5-14)', async () => {
  test.setTimeout(150_000);
  const api = await request.newContext({ baseURL: BASE });
  const { H, h } = await setup(api, { mode: 'team' });
  const [alex, jordan, sam] = [await mkProfile(api, 'Wiz Alex'), await mkProfile(api, 'Wiz Jordan'), await mkProfile(api, 'Drag Sam')];
  await h.act({ type: 'addTeam', name: 'Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: [alex.profile.id, jordan.profile.id] });
  await h.act({ type: 'addTeam', name: 'Dragons', color: '#dc2626', buzzerMode: 'individual', memberIds: [sam.profile.id] });
  const g0 = await h.until((g) => g.competitors.length === 2);
  await h.act({ type: 'updateRules', rules: { ...g0.rules, categoryIntro: false, timers: { ...g0.rules.timers, buzzSeconds: 3 } } });
  await h.act({ type: 'startGame' });
  const wiz = g0.competitors.find((c: { name: string }) => c.name === 'Wizards').id;
  await h.act({ type: 'setControl', competitorId: wiz });

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const phone = await (await cr.newContext({ ...devices['Pixel 7'] })).newPage();
  await phone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), alex.token);
  await phone.goto(`${BASE}/join`);
  const ipad = await (await wk.newContext({ ...LANDSCAPE })).newPage();
  await ipad.goto(`${BASE}/host`);

  // Board: heading names who picks; no "Picks next" select or "Tap a clue" text.
  await expect(ipad.getByTestId('choosing')).toHaveText('Wizards is choosing a clue');
  await expect(ipad.getByTestId('picks-next')).toHaveCount(0);
  await expect(ipad.getByText('Tap a clue to open it on the TV')).toHaveCount(0);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  await expect(ipad.getByTestId('host-category').first()).toHaveText('History');
  const box = (await ipad.getByTestId('host-board-box').boundingBox())!;
  const stage = (await ipad.getByTestId('game-stage').boundingBox())!;
  expect(Math.abs(stage.width / stage.height - 16 / 9 / 0.86)).toBeLessThan(0.02); // the TV's proportions (R11-3), not stretched
  expect(box.width).toBeGreaterThan(LANDSCAPE.viewport.width * 0.7); // large (next to the navigation)
  await shot(ipad, 'landscape-board');
  await ipad.setViewportSize(PORTRAIT);
  await ipad.waitForTimeout(300);
  const pbox = (await ipad.getByTestId('host-board-box').boundingBox())!;
  await shot(ipad, 'portrait-board');
  const pstage = (await ipad.getByTestId('game-stage').boundingBox())!;
  expect(Math.abs(pstage.width / pstage.height - 16 / 9 / 0.86)).toBeLessThan(0.02); // R11-3
  const main = (await ipad.locator('main').boundingBox())!;
  expect(pbox.width).toBeGreaterThan(main.width - 30); // uses the full width of the content column
  await ipad.setViewportSize(LANDSCAPE.viewport);

  // Clue 1: Unlock (bottom right) → Alex buzzes → "Wizards — Wiz Alex" → Correct → Return to Board.
  await ipad.getByRole('button', { name: 'History for 200' }).click();
  await expect(ipad.getByTestId('host-answer')).toHaveText('The Inca');
  await expect(ipad.getByTestId('host-clue-text')).toContainText('Machu Picchu');
  const unlock = ipad.getByTestId('unlock');
  const ub = (await unlock.boundingBox())!;
  expect(ub.x + ub.width).toBeGreaterThan(LANDSCAPE.viewport.width - 110); // right, next to the Fullscreen button (R11-3)
  const footer = (await ipad.getByTestId('clue-footer').boundingBox())!;
  expect(ub.y).toBeGreaterThanOrEqual(footer.y);
  expect(ub.height).toBeGreaterThanOrEqual(56);
  await shot(ipad, 'landscape-clue');
  await unlock.click();
  await expect(ipad.getByTestId('buzzers-open')).toBeVisible();
  await expect(ipad.getByTestId('host-timer')).toContainText('s');
  await expect(phone.getByTestId('buzzer')).toHaveAttribute('data-state', 'open'); // wait for the phone to show it
  await phone.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(ipad.getByTestId('host-winner')).toHaveText('Wizards');
  await expect(ipad.getByTestId('host-winner-member')).toHaveText('— Wiz Alex');
  await expect(ipad.getByTestId('buzzers-open')).toHaveCount(0); // the timer slider makes way
  const c = (await ipad.getByTestId('correct').boundingBox())!;
  const i = (await ipad.getByTestId('incorrect').boundingBox())!;
  expect(Math.abs(c.y - i.y)).toBeLessThan(2); // side by side
  expect(i.x).toBeGreaterThan(c.x);
  expect(c.height).toBeGreaterThanOrEqual(56);
  await shot(ipad, 'landscape-clue-buzzed');
  await ipad.setViewportSize(PORTRAIT);
  await ipad.waitForTimeout(300);
  await shot(ipad, 'portrait-clue-buzzed');
  await ipad.setViewportSize(LANDSCAPE.viewport);
  await ipad.getByTestId('correct').click();
  await expect(tv.getByTestId('clue-answer')).toHaveText('The Inca');
  await expect(ipad.getByTestId('correct')).toHaveCount(0);
  await ipad.getByTestId('back-to-board').click();
  await expect(ipad.getByTestId('choosing')).toHaveText('Wizards is choosing a clue');

  // Clue 2: nobody buzzes. R12-8: while the buzz timer runs, Reveal Answer is the main footer
  // action in Unlock Buzzers' place and size (it was in "More" before round 12).
  await ipad.getByRole('button', { name: 'Geography for 400' }).click();
  const ub2 = (await ipad.getByTestId('unlock').boundingBox())!;
  await ipad.getByTestId('unlock').click();
  await expect(ipad.getByTestId('buzzers-open')).toBeVisible();
  await expect(ipad.getByTestId('reveal-answer')).toBeVisible();
  const rb = (await ipad.getByTestId('reveal-answer').boundingBox())!;
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(rb[k] - ub2[k]), k).toBeLessThan(2);
  await ipad.getByTestId('clue-more').click();
  await expect(ipad.getByTestId('reveal-answer')).toHaveCount(1); // not also in More
  await expect(ipad.getByTestId('skip-clue')).toBeVisible();
  await shot(ipad, 'landscape-clue-more');
  await ipad.getByTestId('clue-more').click(); // close it again
  await expect(ipad.getByTestId('answering-ended')).toBeVisible({ timeout: 6000 });
  await expect(ipad.getByTestId('reveal-answer')).toBeVisible();
  await expect(tv.getByTestId('clue-answer')).toHaveCount(0);
  await ipad.getByTestId('reveal-answer').click();
  await expect(tv.getByTestId('clue-answer')).toBeVisible();
  await ipad.getByTestId('back-to-board').click();

  // Clue 3: timer switched off → Reveal Answer appears in the footer as soon as buzzers open.
  const g1 = await h.until((g) => g.phase === 'board');
  await h.act({ type: 'updateRules', rules: { ...g1.rules, timers: { ...g1.rules.timers, autoStart: false } } });
  await ipad.getByRole('button', { name: 'Science for 200' }).click();
  await expect(ipad.getByTestId('reveal-answer')).toBeHidden();
  await ipad.getByTestId('unlock').click();
  await expect(ipad.getByTestId('buzzers-open')).toBeVisible();
  await expect(ipad.getByTestId('reveal-answer')).toBeVisible();
  await expect(ipad.getByTestId('host-timer')).toHaveCount(0);
  await ipad.getByTestId('reveal-answer').click();
  await expect(tv.getByTestId('clue-answer')).toBeVisible();
  await ipad.getByTestId('back-to-board').click();

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});

test('answer picture opens a private lightbox on the iPad only (R5-14)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const auth = { authorization: `Bearer ${host}` };
  const img = (await (await api.post('/api/media', { headers: auth, multipart: { file: { name: 'answer.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#16a34a' } }).png().toBuffer() } } })).json()) as { url: string };
  const content = structuredClone(SAMPLE_BOARD);
  const hist = content.rounds[0].categories[0];
  hist.clues[0] = { ...hist.clues[0], answerMedia: [{ kind: 'image', url: img.url, caption: 'The citadel' }] };
  const board = await (await api.post('/api/boards', { headers: auth, data: { title: 'Lightbox Board', description: '', tags: [], content } })).json();
  const { H, h } = await setup(api, { boardId: board.id });
  const p = await mkProfile(api, 'Box Bea');
  await h.act({ type: 'addPlayer', profileId: p.profile.id });
  const g0 = await h.until((g) => g.competitors.length === 1);
  await h.act({ type: 'updateRules', rules: { ...g0.rules, categoryIntro: false } });
  await h.act({ type: 'startGame' });

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...LANDSCAPE })).newPage();
  await ipad.goto(`${BASE}/host`);
  await ipad.getByRole('button', { name: 'History for 200' }).click();
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  await ipad.getByTestId('answer-image').click();
  const box = ipad.getByTestId('answer-lightbox');
  await expect(box).toBeVisible();
  const frame = ipad.frameLocator('iframe[title="Answer as the TV shows it"]');
  await expect(frame.getByTestId('clue-answer')).toHaveText('The Inca');
  await expect(frame.getByTestId('answer-side').getByTestId('clue-image')).toHaveAttribute('src', img.url);
  await expect(frame.getByTestId('clue-caption')).toHaveText('The citadel');
  // Nothing reached the TV.
  await expect(tv.getByTestId('clue-answer')).toHaveCount(0);
  expect(await tv.content()).not.toContain('The Inca');
  const g = await h.until(() => true);
  expect(g.clue.answerRevealed).toBe(false);
  await ipad.waitForTimeout(800);
  await shot(ipad, 'landscape-answer-lightbox');
  await ipad.getByTestId('answer-lightbox-close').click();
  await expect(box).toHaveCount(0);
  await expect(ipad.getByTestId('unlock')).toBeVisible();

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
