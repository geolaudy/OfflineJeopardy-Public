// Round 10 — milestone A (small gameplay and presentation fixes):
// - a category's subheading sits directly under its name (board, introduction, Final) (R10-3);
// - a Final clue's media and its text have a clear gap (R10-5);
// - the revealed answer sits a fixed distance under the clue text; the clue never moves (R10-8);
// - the phone's nickname sheet stays above the on-screen keyboard, with Save and Cancel (R10-4);
// - after a round's last clue the iPad goes straight to the next round / the Final (R10-10).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { BoardContent } from '../../src/shared/game';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r10-${name}.png` });
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

/** Two short rounds and a Final: round 1 has two clues, round 2 one. */
function smallBoard(finalMedia: { kind: 'image'; url: string }[] = []): BoardContent {
  return {
    rounds: [
      {
        id: 'r1',
        name: 'Round 1',
        kind: 'standard',
        categories: [
          {
            id: 'c1',
            name: 'Ancient Empires',
            subheading: 'Name the empire',
            clues: [
              { id: 'q1', value: 200, question: 'It built Machu Picchu.', answer: 'The Inca' },
              { id: 'q2', value: 400, question: 'Ruled from Constantinople.', answer: 'The Byzantine Empire' },
            ],
          },
        ],
      },
      { id: 'r2', name: 'Double Round', kind: 'standard', categories: [{ id: 'c2', name: 'Space', clues: [{ id: 'q3', value: 400, question: 'The Red Planet.', answer: 'Mars' }] }] },
      {
        id: 'rf',
        name: 'Final Jeopardy!',
        kind: 'final',
        categories: [{ id: 'cf', name: 'World Capitals', subheading: 'On the Danube', clues: [{ id: 'qf', value: 0, question: 'This capital is split by a river into two historic towns.', answer: 'Budapest', ...(finalMedia.length ? { media: finalMedia } : {}) }] }],
      },
    ],
  };
}

async function startGame(api: Awaited<ReturnType<typeof setup>>['api'], host: string, H: Record<string, string>, content: BoardContent, title: string) {
  const board = await (await api.post('/api/boards', { headers: H, data: { title, description: '', tags: [], content } })).json();
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 10 night' } });
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const ids: string[] = [];
  for (const [i, name] of ['Ten Ann', 'Ten Bo'].entries()) {
    const p = (await (await api.post('/api/profiles', { data: { name: `${name} ${title.slice(-4)}`, color: i ? '#2563eb' : '#dc2626', avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
    ids.push(p.profile.id);
  }
  const g = await h.until((x) => x.competitors.length === 2);
  const [A, B] = ids.map((pid) => g.competitors.find((c: { profileId: string }) => c.profileId === pid).id as string);
  await h.act({ type: 'startGame' });
  return { h, A, B };
}

const box = async (p: Page | ReturnType<Page['locator']>, testId?: string) => {
  const l = testId ? (p as Page).getByTestId(testId).first() : (p as ReturnType<Page['locator']>);
  await expect(l).toBeVisible();
  return (await l.boundingBox())!;
};

test('subheadings under the name, answer under the clue, Final media gap, next round from the last clue (R10-3, 5, 8, 10)', async () => {
  test.setTimeout(150_000);
  const { api, host, H } = await setup();
  const pic = (await (await api.post('/api/media', { headers: H, multipart: { file: { name: 'r10.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#334155' } }).png().toBuffer() } } })).json()) as { url: string };
  const { h, A, B } = await startGame(api, host, H, smallBoard([{ kind: 'image', url: pic.url }]), 'Round Ten A');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);

  // Introduction: the subheading directly under the category name.
  await h.until((g) => !!g.intro);
  await h.act({ type: 'introNext' });
  await expect(tv.getByTestId('intro-subheading')).toHaveText('Name the empire');
  await tv.waitForTimeout(700);
  const iname = await box(tv.locator('.bt-intro-card .bt-intro-cat'));
  const isub = await box(tv, 'intro-subheading');
  expect(isub.y - (iname.y + iname.height)).toBeGreaterThanOrEqual(0);
  expect(isub.y - (iname.y + iname.height)).toBeLessThan(1080 * 0.03);
  await shot(tv, 'intro-subheading');
  await h.act({ type: 'introSkip' });

  // Board: name + subheading are one group, centred in the category cell.
  const cell = await box(tv, 'board-category');
  const cname = await box(tv.getByTestId('board-category').first().locator('.bt-cat-text'));
  const csub = await box(tv.getByTestId('board-category').first().getByTestId('category-subheading'));
  expect(csub.y - (cname.y + cname.height)).toBeLessThan(cname.height * 0.35);
  const mid = (cname.y + csub.y + csub.height) / 2;
  expect(Math.abs(mid - (cell.y + cell.height / 2))).toBeLessThan(cell.height * 0.06);
  await expect(ipad.getByTestId('host-category').first().getByTestId('category-subheading')).toHaveText('Name the empire');
  await shot(tv, 'board-subheading');

  // A plain clue: the answer appears a fixed gap under the clue's text; the clue stays put.
  await h.act({ type: 'selectClue', clueId: 'q1' });
  await tv.waitForTimeout(1500); // the clue's zoom has finished
  const before = await box(tv, 'clue-text');
  await h.act({ type: 'revealAnswer' });
  const ans = await box(tv, 'clue-answer');
  await tv.waitForTimeout(800);
  const after = await box(tv, 'clue-text');
  const ans2 = await box(tv, 'clue-answer');
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  expect(ans2.y - (after.y + after.height)).toBeGreaterThan(1080 * 0.03);
  expect(ans2.y - (after.y + after.height)).toBeLessThan(1080 * 0.065);
  expect(ans.height).toBeGreaterThan(0);
  await shot(tv, 'answer-under-clue');
  // Not the last clue: Return to Board as before.
  await expect(ipad.getByTestId('back-to-board')).toBeVisible();
  await expect(ipad.getByTestId('clue-next-round')).toHaveCount(0);
  await ipad.getByTestId('back-to-board').click();

  // The round's last clue: "Start Double Round" replaces Return to Board → straight into its intro.
  await h.until((g) => g.phase === 'board');
  await h.act({ type: 'selectClue', clueId: 'q2' });
  await h.act({ type: 'revealAnswer' });
  await expect(ipad.getByTestId('clue-next-round')).toHaveText(/Start Double Round/);
  await expect(ipad.getByTestId('back-to-board')).toHaveCount(0);
  await shot(ipad, 'ipad-start-next-round');
  await ipad.getByTestId('clue-next-round').click();
  await expect(tv.getByTestId('intro')).toBeVisible();
  await expect(tv.getByTestId('tv-stage')).toHaveCount(0);
  const g3 = await h.until((g) => g.roundIndex === 1);
  expect(g3.roundIndex).toBe(1);
  expect(g3.intro?.roundIndex).toBe(1);

  // Round 2's only clue → Start Final Jeopardy! → the Final's category (subheading under it).
  await h.act({ type: 'introSkip' });
  await h.act({ type: 'adjustScore', competitorId: B, delta: 800 });
  await h.act({ type: 'selectClue', clueId: 'q3' });
  await h.act({ type: 'revealAnswer' });
  await expect(ipad.getByTestId('clue-start-final')).toBeVisible();
  await ipad.getByTestId('clue-start-final').click();
  await expect(tv.getByTestId('final-subheading')).toHaveText('On the Danube');
  await tv.waitForTimeout(900);
  const fname = await box(tv.locator('[data-testid="tv-final"] .bt-intro-cat'));
  const fsub = await box(tv, 'final-subheading');
  expect(fsub.y - (fname.y + fname.height)).toBeLessThan(1080 * 0.035);

  // The Final's picture clue: a clear gap between the picture and the text.
  await h.act({ type: 'finalNext' });
  await h.until((g) => g.final?.stage === 'wagers');
  for (const id of [A, B]) await h.act({ type: 'setFinalWager', competitorId: id, amount: 0 }).catch(() => undefined);
  await h.act({ type: 'finalNext' });
  const img = await box(tv.getByTestId('tv-final-clue').getByTestId('clue-image'));
  const ftext = await box(tv.getByTestId('tv-final-clue').getByTestId('clue-text'));
  expect(ftext.y - (img.y + img.height)).toBeGreaterThan(1080 * 0.025);
  expect(img.height).toBeGreaterThan(1080 * 0.3);
  await tv.waitForTimeout(600);
  await shot(tv, 'final-media-gap');
  h.close();
});

/** Stands in for the on-screen keyboard: a visual viewport that the test can shrink. */
async function fakeKeyboard(p: Page) {
  await p.addInitScript(() => {
    const vv = new EventTarget();
    let kb = 0;
    for (const [k, get] of Object.entries<() => number>({ height: () => window.innerHeight - kb, width: () => window.innerWidth, offsetTop: () => 0, offsetLeft: () => 0, pageTop: () => window.scrollY, pageLeft: () => 0, scale: () => 1 })) Object.defineProperty(vv, k, { get });
    Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
    (window as unknown as { __kb: (h: number) => void }).__kb = (h: number) => {
      kb = h;
      vv.dispatchEvent(new Event('resize'));
    };
  });
}

for (const [label, device, kbH] of [
  ['iPhone portrait', devices['iPhone 13'], 336],
  ['iPhone landscape', devices['iPhone 13 landscape'], 200],
  ['Android portrait', devices['Pixel 7'], 300],
] as const) {
  test(`phone nickname sheet stays above the keyboard: ${label} (R10-4)`, async () => {
    const { api, H } = await setup();
    await api.post('/api/lobby', { headers: H, data: { name: 'Keyboard night' } });
    const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
    await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
    const me = (await (await api.post('/api/profiles', { data: { name: `Keys ${label}`, color: '#16a34a', avatar: 'owl', pin: '1357' } })).json()) as { token: string };
    const browser = label.startsWith('Android') ? cr : wk;
    const p = await (await browser.newContext({ ...device })).newPage();
    await fakeKeyboard(p);
    await p.addInitScript((t) => localStorage.setItem('oj.profileToken', t), me.token);
    await p.goto(`${BASE}/join`);
    await p.getByTestId('join-game').click();
    await expect(p.getByTestId('lobby-joined')).toBeVisible();
    await p.getByTestId('nickname-open').click();
    await p.getByTestId('nickname-input').click();
    await p.evaluate((h) => (window as unknown as { __kb: (h: number) => void }).__kb(h), kbH);
    const visible = (await p.evaluate(() => window.innerHeight)) - kbH;
    for (const id of ['nickname-input', 'nickname-save', 'nickname-cancel']) {
      await expect.poll(async () => { const b = await p.getByTestId(id).boundingBox(); return b ? b.y + b.height : 1e9; }, { message: `${id} above the keyboard` }).toBeLessThanOrEqual(visible + 1);
      expect((await p.getByTestId(id).boundingBox())!.y).toBeGreaterThanOrEqual(0);
    }
    await p.getByTestId('nickname-input').fill('A very long nickname 24');
    await expect(p.getByTestId('nickname-input')).toHaveValue('A very long nickname 24');
    await shot(p, `nickname-keyboard-${label.replace(' ', '-')}`);
    // Cancel keeps the old (empty) nickname; Save sets it; closing the keyboard restores the sheet.
    await p.getByTestId('nickname-cancel').click();
    await expect(p.getByTestId('nickname-input')).toHaveCount(0);
    await expect(p.getByTestId('nickname-open')).toHaveText(/Add nickname/);
    await p.getByTestId('nickname-open').click();
    await p.getByTestId('nickname-input').fill('Keys');
    await p.evaluate(() => (window as unknown as { __kb: (h: number) => void }).__kb(0));
    await p.getByTestId('nickname-save').click();
    await expect(p.getByTestId('nickname-open')).toHaveText(/Nickname/);
    await expect(p.getByTestId('nickname-open')).not.toHaveText(/Add/);
  });
}
