// End-to-end: TV board (Chromium 1080p), iPad host (WebKit = Safari engine), phones
// (iPhone on WebKit, Android on Chromium), all against the real local server.
import { test, expect, chromium, webkit, devices, type Browser, type Page, request } from '@playwright/test';

const BASE = 'http://127.0.0.1:3210';
let wk: Browser;
let cr: Browser;

test.beforeAll(async () => {
  wk = await webkit.launch();
  cr = await chromium.launch();
});
// Close every page after each test: lingering WebKit contexts slow down later tests on Windows.
test.afterEach(async () => {
  for (const b of [wk, cr]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await wk?.close();
  await cr?.close();
});

async function hostApiToken() {
  const ctx = await request.newContext({ baseURL: BASE });
  const r = await ctx.post('/api/host/local-login');
  const { token } = await r.json();
  return { ctx, token };
}

async function createProfileOnPhone(page: Page, name: string, pin: string) {
  await page.goto(`${BASE}/join`);
  await page.getByTestId('new-profile').click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByLabel('Confirm PIN').fill(pin);
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByTestId('me-name')).toHaveText(name);
}

test('full game: iPad host pairing, phone profiles + buzzing, private answers, live sync, wagers, results', async () => {
  // The iPad is a separate device: require the pairing code instead of trusting localhost.
  const { ctx, token } = await hostApiToken();
  const auth = { authorization: `Bearer ${token}` };
  await ctx.put('/api/settings', { headers: auth, data: { trustLocalhost: false } });
  await ctx.post('/api/lobby', { headers: auth, data: { name: 'E2E night' } }); // pairing codes belong to a lobby
  const { code } = await (await ctx.get('/api/host/pairing-code', { headers: auth })).json();

  // TV board
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByText('Waiting for the host')).toBeVisible();

  // iPad host (Safari engine, landscape)
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByText('Enter the 6-digit host code')).toBeVisible();
  for (const d of '000000' === code ? '111111' : '000000') await ipad.getByRole('button', { name: d, exact: true }).click();
  await expect(ipad.getByRole('alert')).toContainText('Incorrect host code');
  for (const d of code) await ipad.getByRole('button', { name: d, exact: true }).click();
  await expect(ipad.getByRole('heading', { name: 'Set up a game' })).toBeVisible();

  // Phones: iPhone (WebKit) and Android (Chromium)
  const iphone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  const android = await (await cr.newContext({ ...devices['Pixel 7'] })).newPage();
  await createProfileOnPhone(iphone, 'Alex', '0042');
  await createProfileOnPhone(android, 'Sam', '9876');

  // Host creates a solo game from the starter board
  await ipad.getByRole('button', { name: 'Open lobby' }).click();
  await expect(ipad.getByTestId('start-game')).toBeVisible();
  await expect(tv.getByText('Scan to join')).toBeVisible();

  // Players join from phones (single QR → portal → join)
  await iphone.getByTestId('join-game').click();
  await android.getByTestId('join-game').click();
  await expect(ipad.getByTestId('setup-player')).toHaveCount(2);
  await expect(tv.getByText('Alex')).toBeVisible();
  await ipad.getByTestId('start-game').click();

  // Category introduction (FB-4.5): round title, then categories one at a time, host-driven.
  await expect(ipad.getByTestId('intro-controls')).toBeVisible();
  await expect(tv.getByTestId('board-tile')).toHaveCount(0);
  await ipad.getByTestId('intro-next').click();
  await expect(ipad.getByTestId('intro-now')).toContainText('Category 1 of 6: History');
  await expect(tv.getByText('History', { exact: true })).toBeVisible();
  await ipad.getByTestId('intro-next').click();
  await expect(ipad.getByTestId('intro-now')).toContainText('Category 2 of 6');
  await ipad.getByTestId('intro-skip').click();
  await expect(ipad.getByTestId('intro-start')).toBeVisible(); // can be replayed

  // Board on TV
  await expect(tv.getByTestId('board-category').first()).toHaveText('History');
  await expect(tv.getByTestId('board-tile')).toHaveCount(30);

  // Host opens History / 200: TV shows the question, never the answer; host sees the answer
  await ipad.getByRole('button', { name: 'History for 200' }).click();
  await expect(tv.getByTestId('clue-text')).toContainText('MACHU PICCHU', { ignoreCase: true });
  await expect(ipad.getByTestId('host-answer')).toHaveText('The Inca');
  await expect(tv.getByText('The Inca')).toHaveCount(0);
  expect(await tv.content()).not.toContain('The Inca');
  expect(await iphone.content()).not.toContain('The Inca');

  // Full-screen question shows neither the category nor the value (FB-4.3)
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  await expect(tv.getByTestId('tv-clue-panel').getByText('History', { exact: true })).toHaveCount(0);
  await expect(tv.getByTestId('tv-clue-panel').getByText('200')).toHaveCount(0);

  // Phones are armed before the buzzers open: an early press is recorded server-side (FB-3.2)
  await expect(iphone.getByTestId('buzzer')).toHaveAttribute('data-state', 'armed');
  await iphone.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(iphone.getByTestId('buzz-status')).toContainText('Too early');
  await expect(ipad.getByTestId('early-list')).toContainText('Alex');
  await expect(ipad.getByTestId('early-rule-chip')).toContainText('No penalty');

  // Buzzers: locked → unlock → Sam (Android) buzzes first, Alex second
  await ipad.getByTestId('unlock').click();
  await expect(tv.getByText('BUZZERS OPEN')).toBeVisible();
  await expect(android.getByTestId('buzzer')).toBeEnabled();
  await expect(android.getByTestId('buzzer')).toHaveAttribute('data-state', 'open');
  await iphone.screenshot({ path: 'test-results/screens/iphone-buzzer-open.png' });
  await ipad.screenshot({ path: 'test-results/screens/ipad-clue-panel.png' });
  await tv.screenshot({ path: 'test-results/screens/tv-buzzers-open.png' });
  await android.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(tv.getByTestId('buzz-winner')).toContainText('Sam');
  await expect(ipad.getByTestId('host-winner')).toHaveText('Sam');
  await expect(android.getByTestId('buzz-status')).toHaveText('Answer now!');
  await expect(iphone.getByTestId('buzz-status')).toHaveText('Sam buzzed first');

  // Timer synchronised on TV and host
  await expect(tv.getByRole('timer')).toBeVisible();
  await expect(ipad.getByTestId('host-timer')).toContainText('s');

  // Correct → +200 everywhere, answer revealed publicly
  await ipad.getByTestId('correct').click();
  await expect(tv.getByTestId('clue-answer')).toHaveText('The Inca');
  await expect(android.getByTestId('my-score')).toHaveText('200');
  await ipad.getByTestId('back-to-board').click();
  await expect(tv.getByTestId('board-tile')).toHaveCount(29);
  await expect(tv.getByTestId('scoreboard')).toContainText('200');

  // Incorrect answer → negative score; then undo
  await ipad.getByRole('button', { name: 'Geography for 400' }).click();
  await ipad.getByTestId('unlock').click();
  await iphone.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(ipad.getByTestId('host-winner')).toHaveText('Alex');
  await ipad.getByTestId('incorrect').click();
  await expect(iphone.getByTestId('my-score')).toHaveText('−400');
  await ipad.getByTestId('undo').click();
  await expect(iphone.getByTestId('my-score')).toHaveText('0');
  await ipad.getByTestId('incorrect').click();
  // Nobody else answers: host ends answering → reveals the answer → returns to the board (FB-5.1)
  await expect(ipad.getByTestId('back-to-board')).toHaveCount(0);
  await ipad.getByTestId('end-answering').click();
  await expect(ipad.getByTestId('answering-ended')).toBeVisible();
  await expect(tv.getByTestId('clue-answer')).toHaveCount(0);
  await ipad.getByTestId('reveal-answer').click();
  await expect(tv.getByTestId('clue-answer')).toBeVisible();
  await ipad.getByTestId('back-to-board').click();
  await expect(ipad.getByTestId('phase')).toContainText('choose a clue');

  // Profile change on the phone syncs live to TV and host without refresh
  await iphone.getByTestId('nav-menu').click();
  await iphone.getByTestId('nav-profile').click();
  await expect(iphone.getByTestId('page-title')).toHaveText('My profile');
  await iphone.getByLabel('Name', { exact: true }).fill('AlexTheWizard');
  await iphone.getByTestId('save-profile').click();
  await expect(tv.getByTestId('scoreboard')).toContainText('AlexTheWizard');
  await expect(ipad.getByTestId('host-score').first()).toContainText(/AlexTheWizard|Sam/);
  await expect(ipad.getByRole('button', { name: 'Adjust score for AlexTheWizard' })).toBeVisible();

  // Daily Wager (Science 800): TV hides the clue until the wager is locked
  await ipad.getByRole('button', { name: /Science for 800/ }).click();
  await expect(tv.getByText('DAILY WAGER!')).toBeVisible();
  await expect(tv.getByTestId('clue-text')).toHaveCount(0);
  await ipad.getByLabel('Wager amount').fill('500');
  await ipad.getByRole('button', { name: 'Lock wager & show clue' }).click();
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  await ipad.getByTestId('correct').click();
  await ipad.getByTestId('back-to-board').click();

  // Host disconnects and reconnects (reload): state intact, no restart
  await ipad.reload();
  await expect(ipad.getByTestId('host-score')).toHaveCount(2);
  await expect(ipad.getByTestId('phase')).toContainText('choose a clue');

  // End the game from the menu → winner on TV, results on phones
  await ipad.getByRole('button', { name: 'Game menu' }).click();
  ipad.once('dialog', (d) => d.accept());
  await ipad.getByRole('button', { name: 'End game' }).click();
  await expect(tv.getByTestId('winner')).toContainText('wins!');
  await iphone.getByTestId('nav-menu').click();
  await iphone.getByTestId('nav-play').click();
  await expect(iphone.getByText(/Game over|You won/)).toBeVisible();

  // History & stats on the phone (FB-2.3): list → detail page → browser-style back
  await iphone.getByTestId('nav-menu').click();
  await iphone.getByTestId('nav-history').click();
  await expect(iphone.getByTestId('history-row')).toHaveCount(1);
  await iphone.getByTestId('history-row').click();
  await expect(iphone.getByText('Clue by clue')).toBeVisible();
  await expect(iphone.getByTestId('history-clue').first()).toBeVisible(); // Alex's own clues
  await iphone.getByTestId('nav-back').click();
  await expect(iphone.getByTestId('page-title')).toHaveText('Game history');
  await iphone.goBack();
  await expect(iphone.getByTestId('page-title')).not.toHaveText('Game history');
  await iphone.getByTestId('nav-menu').click();
  await iphone.getByTestId('nav-stats').click();
  await expect(iphone.getByText('Games played')).toBeVisible();

  // Leaderboard + another player's public page (FB-2.1, FB-2.2)
  await iphone.getByTestId('nav-menu').click();
  await iphone.getByTestId('nav-leaderboard').click();
  await expect(iphone.getByTestId('leaderboard-row')).toHaveCount(2);
  await iphone.getByTestId('leaderboard-row').filter({ hasText: 'Sam' }).click();
  await expect(iphone.getByTestId('player-name')).toHaveText('Sam');
  await expect(iphone.getByText('Recent games')).toBeVisible();

  await ctx.put('/api/settings', { headers: auth, data: { trustLocalhost: true } });
  await ctx.dispose();
});

test('PIN sign-in on a phone: wrong PIN rejected, correct PIN accepted, session survives reload', async () => {
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await createProfileOnPhone(phone, 'Jordan', '1357');
  await phone.getByTestId('nav-menu').click();
  await phone.getByTestId('nav-settings').click();
  await phone.getByTestId('sign-out').click();
  await phone.getByTestId('profile-tile').filter({ hasText: 'Jordan' }).click();
  for (const d of '0000') await phone.getByRole('button', { name: d, exact: true }).click();
  await expect(phone.getByRole('alert').filter({ hasText: 'Wrong PIN' })).toBeVisible();
  for (const d of '1357') await phone.getByRole('button', { name: d, exact: true }).click();
  await expect(phone.getByTestId('me-name')).toHaveText('Jordan');
  await phone.reload();
  await expect(phone.getByTestId('me-name')).toHaveText('Jordan');
});

test('works with no internet: every request stays on the local server', async () => {
  const page = await (await cr.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  for (const path of ['/board', '/join', '/host', '/desk', '/host/boards', '/host/players', '/host/settings']) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});
