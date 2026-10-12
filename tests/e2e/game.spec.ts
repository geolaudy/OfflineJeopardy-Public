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
  await expect(ipad.getByRole('heading', { name: 'New game' })).toBeVisible();

  // Phones: iPhone (WebKit) and Android (Chromium)
  const iphone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  const android = await (await cr.newContext({ ...devices['Pixel 7'] })).newPage();
  await createProfileOnPhone(iphone, 'Alex', '0042');
  await createProfileOnPhone(android, 'Sam', '9876');

  // Host creates a solo game from the starter board
  await ipad.getByRole('button', { name: 'Create game' }).click();
  await expect(ipad.getByTestId('start-game')).toBeVisible();
  await expect(tv.getByText('Scan to join')).toBeVisible();

  // Players join from phones (single QR → portal → join)
  await iphone.getByTestId('join-game').click();
  await android.getByTestId('join-game').click();
  await expect(ipad.getByTestId('setup-player')).toHaveCount(2);
  await expect(tv.getByText('Alex')).toBeVisible();
  await ipad.getByTestId('start-game').click();

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

  // Buzzers: locked → unlock → Sam (Android) buzzes first, Alex second
  await expect(iphone.getByTestId('buzzer')).toBeDisabled();
  await ipad.getByTestId('unlock').click();
  await expect(tv.getByText('BUZZERS OPEN')).toBeVisible();
  await expect(android.getByTestId('buzzer')).toBeEnabled();
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
  await ipad.getByTestId('back-to-board').click();

  // Profile change on the phone syncs live to TV and host without refresh
  await iphone.getByRole('tab', { name: /Profile/ }).click();
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
  await iphone.getByRole('tab', { name: /Play/ }).click();
  await expect(iphone.getByText(/Game over|You won/)).toBeVisible();

  // History & stats on the phone
  await iphone.getByRole('tab', { name: /History/ }).click();
  await expect(iphone.getByTestId('history-row')).toHaveCount(1);
  await iphone.getByTestId('history-row').click();
  await expect(iphone.getByText('Clue by clue')).toBeVisible();
  await iphone.keyboard.press('Escape');
  await iphone.getByRole('tab', { name: /Stats/ }).click();
  await expect(iphone.getByText('Games played')).toBeVisible();

  await ctx.put('/api/settings', { headers: auth, data: { trustLocalhost: true } });
  await ctx.dispose();
});

test('PIN sign-in on a phone: wrong PIN rejected, correct PIN accepted, session survives reload', async () => {
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await createProfileOnPhone(phone, 'Jordan', '1357');
  await phone.getByRole('tab', { name: /Profile/ }).click();
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
  for (const path of ['/board', '/join', '/host', '/desk', '/desk/library', '/desk/players', '/desk/settings']) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});
