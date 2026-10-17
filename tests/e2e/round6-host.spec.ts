// Round 6, milestone D (iPad host): the intro's TV preview has no score strip (the iPad's own score
// bar is below it) and keeps the TV's 16:9 shape (R6-2.1); Previous Category | Next Category
// (R6-2.3); the picker's mustard ring is fully visible in the score bar (R6-2.2); category text
// takes the same share of its box on the TV and on the iPad board (R6-2.4).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r6-${name}.png` });
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

/** Font size of each category's text as a share of its cell's height. */
async function catRatios(page: Page | ReturnType<Page['frameLocator']>, testId: string) {
  const cells = page.getByTestId(testId);
  return cells.evaluateAll((els) =>
    els.map((el) => {
      const t = el.querySelector('.bt-cat-text') as HTMLElement;
      const box = t.parentElement!.getBoundingClientRect();
      // Height share, and whether a long name is held back by the width instead (fills it).
      return { h: parseFloat(getComputedStyle(t).fontSize) / el.getBoundingClientRect().height, wide: t.scrollWidth / box.width > 0.85 };
    }),
  );
}

test('iPad host: preview without score strip, Previous | Next, full highlight ring, category text proportions', async () => {
  test.setTimeout(120_000);
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 6 host' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const name of ['Peggy Quigley', 'Jay Gupta']) {
    const p = (await (await api.post('/api/profiles', { data: { name, color: '#1d4ed8', avatar: 'owl', pin: '1357' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
  }
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await ipad.getByTestId('start-game').click();

  // ---- R6-2.1: the TV preview shows the presentation only, 16:9 ----
  await expect(ipad.getByTestId('intro-preview')).toHaveAttribute('data-ready', 'true');
  const preview = ipad.frameLocator('iframe[title="TV preview"]');
  await expect(preview.getByTestId('intro')).toBeVisible();
  await expect(preview.getByTestId('scoreboard')).toHaveCount(0);
  const box = (await ipad.getByTestId('intro-preview').boundingBox())!;
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);

  // ---- R6-2.3: Previous on the left, Next on the right ----
  const prev = (await ipad.getByTestId('intro-prev').boundingBox())!;
  const next = (await ipad.getByTestId('intro-next').boundingBox())!;
  expect(prev.x).toBeLessThan(next.x);
  await shot(ipad, 'ipad-intro');

  await ipad.getByTestId('intro-skip').click();
  await expect(ipad.getByTestId('host-board')).toBeVisible();
  await expect(tv.getByTestId('board-category').first()).toBeVisible();
  await tv.waitForTimeout(1500); // board fill-in done

  // ---- R6-2.2: the picker's ring is inside the visible score bar ----
  const picked = ipad.locator('[data-testid="host-score"][data-highlight="pick"]');
  await expect(picked).toHaveCount(1);
  const clipped = await picked.evaluate((el) => {
    const ring = 4; // ring-2 + border, generously
    const r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && getComputedStyle(p).overflowX === 'visible' && getComputedStyle(p).overflowY === 'visible') p = p.parentElement;
    const c = p!.getBoundingClientRect();
    return r.top - ring < c.top || r.bottom + ring > c.bottom || r.left - ring < c.left;
  });
  expect(clipped).toBe(false);

  // ---- R6-2.4: category text is the same share of its box on both screens ----
  const tvR = await catRatios(tv, 'board-category');
  const ipadR = await catRatios(ipad, 'host-category');
  await shot(tv, 'tv-board');
  await shot(ipad, 'ipad-board');
  for (let i = 0; i < tvR.length; i++) {
    if (tvR[i].wide && ipadR[i].wide) continue; // long name: fills the width on both screens
    expect(Math.abs(tvR[i].h - ipadR[i].h) / ipadR[i].h, `category ${i}: TV ${tvR[i].h} vs iPad ${ipadR[i].h}`).toBeLessThan(0.12);
  }
  expect(tvR.filter((r) => !r.wide).length).toBeGreaterThan(0);

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
