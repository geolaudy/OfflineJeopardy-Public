// Round 7, milestone B (TV presentation): board proportions, colours and shadows from the
// reference board (RESEARCH_NOTES "Board reference", R7-5); board-control star (R7-6); clue text
// visible through the zoom (R7-13); clue centred and still on answer reveal (R7-16); Final clue
// centred (R7-7). Screenshots: test-results/screens/r7-tv-*.png.
import { test, expect, chromium, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r7-tv-${name}.png` });
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterAll(async () => {
  await cr?.close();
});

async function setup(names: string[]) {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 7 TV' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const name of names) {
    const p = (await (await api.post('/api/profiles', { data: { name: `${name} ${Date.now() % 100000}`, color: '#16a34a', avatar: 'owl', pin: '1357' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
  }
  return { api, H, h };
}

test('TV board, clue and Final presentation (R7-5, R7-6, R7-7, R7-13, R7-16)', async () => {
  test.setTimeout(150_000);
  const { api, H, h } = await setup(['Ava', 'Ben', 'Cat']);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  const g = await h.until((x) => x.phase === 'board');
  await expect(tv.getByTestId('board-tile')).toHaveCount(30);
  await tv.waitForTimeout(1500);
  await shot(tv, 'board');

  // ---- R7-5: proportions of the reference board ----
  const m = await tv.evaluate(() => {
    const tile = document.querySelector('.bt-tile') as HTMLElement;
    const tiles = [...document.querySelectorAll('.bt-cell')] as HTMLElement[];
    const r = tile.getBoundingClientRect();
    const right = tiles.find((t) => Math.abs(t.getBoundingClientRect().top - r.top) < 1 && t.getBoundingClientRect().left > r.right)!.getBoundingClientRect();
    const below = tiles.find((t) => Math.abs(t.getBoundingClientRect().left - r.left) < 1 && t.getBoundingClientRect().top > r.bottom)!.getBoundingClientRect();
    const v = tile.querySelector('.bt-value') as HTMLElement;
    const cs = getComputedStyle(v);
    const cat = document.querySelector('.bt-cat-text') as HTMLElement;
    return {
      colGap: (right.left - r.right) / r.width,
      rowGap: (below.top - r.bottom) / r.height,
      valueColor: cs.color,
      valueShadow: cs.textShadow,
      valueFont: parseFloat(cs.fontSize) / r.height,
      tileBg: getComputedStyle(tile).backgroundColor,
      catShadow: getComputedStyle(cat).textShadow,
    };
  });
  console.log('board metrics', JSON.stringify(m));
  expect(m.valueColor).toBe('rgb(214, 159, 76)'); // #d69f4c
  expect(m.tileBg).toBe('rgb(7, 18, 119)'); // #071277
  expect(m.colGap).toBeGreaterThan(0.04);
  expect(m.colGap).toBeLessThan(0.09);
  expect(m.rowGap).toBeGreaterThan(0.07);
  expect(m.rowGap).toBeLessThan(0.14);
  expect(m.valueShadow).not.toContain('blur');

  // ---- R7-6: board-control star; nothing moves when it appears ----
  const firstId = g.competitors[0].id;
  const namePos = () => tv.getByTestId('podium').first().locator('.bt-podium-name span').first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
  const before = await namePos();
  await h.act({ type: 'setControl', competitorId: firstId });
  await expect(tv.getByTestId('podium').first().getByTestId('control-star')).toBeVisible();
  expect(await namePos()).toBe(before);
  await expect(tv.getByTestId('control-star')).toHaveCount(1);
  await shot(tv, 'star');

  // ---- R7-13: clue text visible inside the expanding tile ----
  const clue = g.rounds[0].categories[1].clues[2];
  await h.act({ type: 'selectClue', clueId: clue.id });
  await tv.waitForTimeout(200); // mid-zoom
  const mid = await tv.evaluate(() => {
    const panel = document.querySelector('[data-testid="tv-clue-panel"]') as HTMLElement;
    const content = panel.querySelector('.bt-content') as HTMLElement;
    return { opacity: getComputedStyle(content).opacity, transform: getComputedStyle(panel).transform };
  });
  expect(mid.transform).not.toBe('none'); // still zooming
  expect(Number(mid.opacity)).toBeGreaterThan(0.9);
  await shot(tv, 'zoom-mid');
  await tv.waitForTimeout(1200);
  await shot(tv, 'clue');

  // ---- R7-16: centred, and the answer reveal does not move the clue ----
  const textBox = () =>
    tv.getByTestId('clue-text').evaluate((el) => {
      const r = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? el.getBoundingClientRect();
      const stage = document.querySelector('[data-testid="tv-clue-panel"]')!.getBoundingClientRect();
      return { centre: (r.top + r.bottom) / 2 - stage.top, stageH: stage.height, top: r.top };
    });
  const c1 = await textBox();
  expect(Math.abs(c1.centre - c1.stageH / 2)).toBeLessThan(c1.stageH * 0.04);
  await h.act({ type: 'revealAnswer' });
  await expect(tv.getByTestId('clue-answer')).toBeVisible();
  await tv.waitForTimeout(800);
  const c2 = await textBox();
  expect(Math.abs(c2.top - c1.top)).toBeLessThan(1.5);
  await shot(tv, 'answer');
  await h.act({ type: 'closeClue' });

  // ---- R7-7: Final clue centred ----
  for (const c of g.competitors) await h.act({ type: 'adjustScore', competitorId: c.id, delta: 1000 }); // only positive scores play
  await h.act({ type: 'startFinal' });
  await tv.waitForTimeout(1500);
  await shot(tv, 'final-category');
  await h.act({ type: 'finalNext' }); // wagers
  for (const c of g.competitors) await h.act({ type: 'setFinalWager', competitorId: c.id, amount: 0 });
  await h.act({ type: 'finalNext' }); // clue
  await tv.waitForTimeout(1500);
  const f = await tv.evaluate(() => {
    const q = document.querySelector('.bt-final-q .bt-fit') as HTMLElement;
    const stage = document.querySelector('[data-testid="tv-final"]')!.getBoundingClientRect();
    const r = q.getBoundingClientRect();
    return { centre: (r.top + r.bottom) / 2 - stage.top, stageH: stage.height };
  });
  expect(Math.abs(f.centre - f.stageH / 2)).toBeLessThan(f.stageH * 0.03);
  await shot(tv, 'final-clue');
  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
});
