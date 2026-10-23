// README screenshots: drives the real server and web app (TV in Chromium at 1080p, the host on an
// emulated iPad, players on emulated iPhones) through one demo game and saves the pictures in
// docs/screenshots/. Not part of the test suite: `npm run screenshots` (playwright.screenshots.config.ts).
// Demo names only; the fresh data folder has no real profiles, and the PC's Wi-Fi details are not shown.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import { hostSocket } from '../e2e/hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3290}`;
const OUT = 'docs/screenshots';
const shot = async (p: Page, name: string, settle = 1500) => {
  await p.waitForTimeout(settle); // let the TV's zoom / fade animations finish
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 85 }); // the TV's textured blue makes PNGs ~2 MB
};

let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
test.afterAll(async () => {
  await cr?.close();
  await wk?.close();
});

// A failed run saves every open page (the contexts here are not Playwright's fixtures).
test.afterEach(async ({}, info) => {
  if (info.status === info.expectedStatus) return;
  let n = 0;
  for (const b of [cr, wk]) for (const c of b.contexts()) for (const p of c.pages()) await p.screenshot({ path: `test-results/screens/readme-failed-${n++}.png` });
});

test('README screenshots', async () => {
  test.setTimeout(300_000);
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  const players = [
    { name: 'Alex', color: '#2563eb', avatar: 'fox' },
    { name: 'Sam', color: '#dc2626', avatar: 'owl' },
    { name: 'Jordan', color: '#16a34a', avatar: 'panda' },
  ];
  const profiles: { id: string; token: string }[] = [];
  for (const p of players) {
    const j = (await (await api.post('/api/profiles', { data: { ...p, pin: '2468' } })).json()) as { profile: { id: string }; token: string };
    profiles.push({ id: j.profile.id, token: j.token });
  }
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const starter = boards.find((b) => b.title === 'Starter Trivia Night')!;

  // Board editor (desktop browser).
  const desk = await (await cr.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await desk.goto(`${BASE}/host/boards/${starter.id}`);
  await expect(desk.locator('span[title="Drag to reorder"]').first()).toBeVisible();
  await shot(desk, 'board-editor', 800);

  // Lobby: the TV shows the join QR and the players as they join from their phones.
  await api.post('/api/lobby', { headers: H, data: { name: 'Friday Trivia Night' } });
  await api.post('/api/games', { headers: H, data: { boardId: starter.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  const phones: Page[] = [];
  for (const p of profiles) {
    const phone = await (await wk.newContext(devices['iPhone 13'])).newPage();
    await phone.addInitScript((t) => localStorage.setItem('oj.profileToken', t), p.token);
    await phone.goto(`${BASE}/join`);
    await phone.getByTestId('join-game').click();
    await expect(phone.getByTestId('lobby-joined')).toBeVisible();
    phones.push(phone);
  }
  await h.act({ type: 'addBot', name: 'Robo Rita', level: 'medium' });
  let g = await h.until((x) => x.competitors.length === 4);
  await expect(tv.getByText('Alex')).toBeVisible();
  await shot(tv, 'tv-lobby');
  await shot(ipad, 'host-lobby');

  // Start, skip the category introduction, give the board some history.
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  g = await h.until((x) => x.phase === 'board');
  const [alex, sam, jordan] = phones;
  // Whoever wins the buzz (the bot is sometimes quicker) answers correctly.
  const play = async (label: RegExp, who: Page) => {
    await ipad.getByRole('button', { name: label }).click();
    await ipad.getByTestId('unlock').click();
    const won = async () => (await ipad.getByTestId('host-winner').count()) > 0;
    await expect.poll(async () => (await won()) || (await who.getByTestId('buzzer').getAttribute('data-state')) === 'open').toBe(true);
    if (!(await won())) await who.getByTestId('buzzer').dispatchEvent('pointerdown');
    await expect(ipad.getByTestId('host-winner')).toBeVisible();
    await ipad.getByTestId('correct').click();
    await ipad.getByTestId('back-to-board').click();
    await expect(ipad.getByTestId('choosing')).toBeVisible();
  };
  await play(/^History for 200$/, alex);
  await play(/^Geography for 200$/, sam);
  await play(/^History for 400$/, jordan);
  await play(/^Geography for 400$/, alex);
  await shot(tv, 'tv-board');
  await shot(ipad, 'host-board');

  // A clue: the TV shows the question, the host sees the answer, the phones buzz.
  await ipad.getByRole('button', { name: /^Geography for 600$/ }).click();
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  await shot(tv, 'tv-clue', 2500);
  await ipad.getByTestId('unlock').click();
  await expect(sam.getByTestId('buzzer')).toHaveAttribute('data-state', 'open');
  await shot(sam, 'phone-buzzer', 0);
  await sam.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(ipad.getByTestId('host-winner')).toBeVisible(); // the bot is sometimes quicker
  await shot(ipad, 'host-clue', 800);
  await ipad.getByTestId('correct').click();
  await ipad.getByTestId('back-to-board').click();

  // Daily Double!
  await ipad.getByRole('button', { name: /Science for 800/ }).click();
  await expect(tv.getByText('DAILY DOUBLE!')).toBeVisible();
  await shot(tv, 'tv-daily-double', 2500);
  await ipad.getByTestId('host-dd-input').fill('1000');
  await ipad.getByTestId('host-dd-input').press('Enter');
  await ipad.getByTestId('host-dd-lock').click();
  await ipad.getByTestId('host-dd-start-timer').click();
  await ipad.getByTestId('correct').click();
  await ipad.getByTestId('back-to-board').click();

  // Final Jeopardy!: wagers and answers from the phones (only positive scores play Final).
  for (const p of profiles) {
    const id = g.competitors.find((c: unknown) => JSON.stringify(c).includes(p.id)).id as string;
    const score = (await h.until(() => true)).competitors.find((c: { id: string }) => c.id === id).score as number;
    if (score < 400) await h.act({ type: 'adjustScore', competitorId: id, delta: 400 - score + 600 });
  }
  await h.act({ type: 'startFinal' });
  await ipad.getByTestId('final-next').click(); // Open Wagers
  for (const [i, p] of phones.entries()) {
    await p.getByTestId('phone-final-wager-input').fill(String([300, 200, 100][i]));
    await p.getByTestId('phone-final-wager-submit').click();
  }
  await expect(ipad.getByTestId('final-next')).toHaveAttribute('data-step', 'show-clue', { timeout: 20_000 });
  await ipad.getByTestId('final-next').click(); // Show Clue
  await expect(tv.getByTestId('tv-final-clue')).toBeVisible();
  await ipad.getByTestId('final-unlock-answers').click();
  await expect(alex.getByTestId('phone-final-answer')).toBeVisible();
  await alex.getByTestId('phone-final-answer').fill('What is the Danube?');
  await shot(alex, 'phone-final-answer', 300);
  for (const [i, p] of phones.entries()) {
    await p.getByTestId('phone-final-answer').fill(['What is the Danube?', 'What is the Rhine?', 'What is the Danube?'][i]);
    await p.getByTestId('phone-final-answer-submit').click();
  }
  await shot(tv, 'tv-final-clue', 2000);
  await shot(ipad, 'host-final', 800);
  h.close();
});
