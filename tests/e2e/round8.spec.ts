// Round 8 on the TV and the iPad:
// - R8-2: the clue text is visible from the first frame of the zoom and never blinks out after it;
// - R8-3: the iPad's board replica has the TV board's proportions (gaps per tile) and shadow;
// - R8-5: a long Final Jeopardy! answer shrinks inside its fixed card — nothing above it moves;
// - R8-6.4: the minimized lobby moves with the page when one menu page replaces another.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r8-${name}.png` });
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

async function setup(name: string) {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const board = boards.find((b) => b.title === 'Starter Trivia Night')!;
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const mk = async (n: string, color: string) => (await (await api.post('/api/profiles', { data: { name: n, color, avatar: 'fox', pin: '2468' } })).json()) as { token: string; profile: { id: string } };
  const done = async () => {
    h.close();
    await api.post('/api/games/close', { headers: H });
    await api.delete('/api/lobby', { headers: H });
    await api.dispose();
  };
  return { api, host, h, mk, board, done };
}

/** Gap between neighbouring tiles as a share of the tile (columns: of its width, rows: of its height). */
async function gapRatios(p: Page, tile: string) {
  return p.evaluate((sel) => {
    const tiles = [...document.querySelectorAll<HTMLElement>(sel)];
    const r = tiles.map((t) => t.getBoundingClientRect());
    const a = r[0];
    const right = r.find((x) => Math.abs(x.top - a.top) < 2 && x.left > a.right)!;
    const below = r.find((x) => Math.abs(x.left - a.left) < 2 && x.top > a.bottom)!;
    const value = tiles[0].querySelector('.bt-value') as HTMLElement;
    const shadow = getComputedStyle(value).textShadow;
    const px = parseFloat(shadow.match(/(-?[\d.]+)px/g)?.[0] ?? '0');
    return { col: (right.left - a.right) / a.width, row: (below.top - a.bottom) / a.height, shadowPerFont: px / parseFloat(getComputedStyle(value).fontSize), shadowLayers: shadow.split('px,').length };
  }, tile);
}

test('clue text never flickers; the iPad board has the TV board proportions (R8-2, R8-3)', async () => {
  const { h, mk, done } = await setup('Round 8 board');
  const [a, b] = [await mk('Flick Ann', '#dc2626'), await mk('Flick Ben', '#2563eb')];
  for (const p of [a, b]) await h.act({ type: 'addPlayer', profileId: p.profile.id });
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  await expect(tv.getByTestId('board-tile')).toHaveCount(30);
  await tv.waitForTimeout(1600); // board fill-in done

  // R8-3: the iPad replica, same board.
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);
  const tvR = await gapRatios(tv, '[data-testid="board-tile"]');
  const padR = await gapRatios(ipad, '[data-testid="host-tile"]');
  expect(Math.abs(padR.col - tvR.col)).toBeLessThan(0.012);
  expect(Math.abs(padR.row - tvR.row)).toBeLessThan(0.02);
  expect(padR.shadowLayers).toBe(tvR.shadowLayers); // the TV's single hard shadow, no extra blur
  expect(Math.abs(padR.shadowPerFont - tvR.shadowPerFont)).toBeLessThan(0.01);
  await shot(tv, 'tv-board');
  await shot(ipad, 'ipad-board');

  // R8-2: sample the clue's visible opacity on every frame from the moment it appears.
  await tv.evaluate(() => {
    const w = window as unknown as { __samples: { t: number; o: number }[] };
    w.__samples = [];
    let start = 0;
    const tick = (now: number) => {
      const stage = document.querySelector<HTMLElement>('[data-testid="tv-stage"]');
      const content = stage?.closest<HTMLElement>('.bt-content');
      if (stage && content) {
        if (!start) start = now;
        w.__samples.push({ t: now - start, o: Number(getComputedStyle(stage).opacity) * Number(getComputedStyle(content).opacity) });
      }
      if (!start || now - start < 1800) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await h.act({ type: 'selectClue', clueId: 'hist_3' });
  await expect(tv.getByTestId('tv-clue-panel')).toBeVisible();
  await tv.waitForTimeout(2200);
  const samples = (await tv.evaluate(() => (window as unknown as { __samples: { t: number; o: number }[] }).__samples)) as { t: number; o: number }[];
  expect(samples.length).toBeGreaterThan(30);
  // Visible from the first frame and never dips afterwards (the old bug: 0 → fade-in at ~0.73 s).
  expect(Math.min(...samples.map((s) => s.o))).toBeGreaterThan(0.95);
  await done();
});

test('a long Final Jeopardy! answer shrinks inside its card; the name and category stay put (R8-5)', async () => {
  test.setTimeout(120_000);
  const { h, mk, done } = await setup('Round 8 final');
  const ps = [await mk('Final Fay', '#dc2626'), await mk('Final Gus', '#2563eb')];
  for (const p of ps) await h.act({ type: 'addPlayer', profileId: p.profile.id });
  const g0 = await h.until((g) => g.competitors.length === 2);
  const [A, B] = ps.map((p) => g0.competitors.find((c: { profileId: string }) => c.profileId === p.profile.id).id as string);
  const tv = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  await h.act({ type: 'adjustScore', competitorId: A, delta: 1000 });
  await h.act({ type: 'adjustScore', competitorId: B, delta: 2000 });
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'setFinalWager', competitorId: A, amount: 500 });
  await h.act({ type: 'setFinalWager', competitorId: B, amount: 100 });
  await h.act({ type: 'finalNext' });
  const long = 'What is the extraordinarily long and winding answer that keeps going on and on about Budapest, Buda and Pest, the Danube, the Chain Bridge and the Hungarian Parliament Building?';
  await h.act({ type: 'setFinalAnswer', competitorId: A, answer: long, submit: true });
  await h.act({ type: 'setFinalAnswer', competitorId: B, answer: 'Budapest', submit: true });
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'finalNext' }); // reveals: lowest first (Fay)
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Final Fay');
  await tv.waitForTimeout(900);
  const before = { name: (await tv.getByTestId('tv-final-name').boundingBox())!, card: (await tv.locator('.bt-final-answer-card').boundingBox())! };
  await h.act({ type: 'finalReveal' }); // wager
  await h.act({ type: 'finalReveal' }); // answer
  await expect(tv.getByTestId('tv-final-answer')).toContainText('Chain Bridge');
  await tv.waitForTimeout(900);
  const after = { name: (await tv.getByTestId('tv-final-name').boundingBox())!, card: (await tv.locator('.bt-final-answer-card').boundingBox())! };
  expect(Math.abs(after.card.height - before.card.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.name.y - before.name.y)).toBeLessThanOrEqual(1);
  const cat = (await tv.locator('.bt-final .bt-intro-cat').first().boundingBox())!;
  expect(cat.y + cat.height).toBeLessThanOrEqual(after.name.y);
  // The answer fits its card.
  expect(await tv.getByTestId('tv-final-answer').locator('.bt-fit-box').evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await shot(tv, 'final-long-answer');
  await done();
});

test('the minimized lobby moves with the page on a menu change (R8-6.4)', async () => {
  const { host, done } = await setup('Round 8 lobby');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token: host }));
  const present = (req: Record<string, unknown>) => ws.send(JSON.stringify({ t: 'present', req }));
  present({ page: 'players' });
  await expect(tv.getByTestId('tv-lobby-compact')).toBeVisible();
  await tv.waitForTimeout(1200);
  const running = () => tv.getByTestId('tv-lobby-compact').evaluate((e) => e.getAnimations().length);
  expect(await running()).toBe(0);
  present({ page: 'rules' });
  await expect(tv.locator('[data-testid=tv-present-page][data-page=rules]')).toBeVisible();
  expect(await running()).toBeGreaterThan(0);
  expect(await tv.getByTestId('tv-join-card').evaluate((e) => e.getAnimations().length)).toBeGreaterThan(0);
  await tv.waitForTimeout(900);
  expect(await running()).toBe(0);
  await expect(tv.getByTestId('tv-lobby-compact')).toHaveCSS('opacity', '1');
  await shot(tv, 'compact-rules');
  present({ page: 'lobby' });
  ws.close();
  await done();
});
