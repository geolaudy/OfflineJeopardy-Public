// E2E (R2-1..R2-8): the game computer's start screen creates a lobby, the iPad pairs in one step
// from the lobby QR link, the start screen sees the host connect, the host's navigation is
// presented on the TV (and stops in private view), and closing the lobby retires the pairing code.
import { test, expect, chromium, webkit, devices, request, type Browser } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
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

test('start screen → create lobby → one-step iPad pairing → present on TV → close lobby', async () => {
  const ctx = await request.newContext({ baseURL: BASE });
  const { token } = await (await ctx.post('/api/host/local-login')).json();
  const auth = { authorization: `Bearer ${token}` };
  await ctx.delete('/api/lobby', { headers: auth }); // start from the start screen
  await ctx.post('/api/games/close', { headers: auth });

  // TV home screen before any lobby (R5-2): welcome, waiting for the host, no join QR, no categories.
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-home-status')).toContainText('Waiting for the host to open a lobby');
  await expect(tv.getByText('Scan to join')).toHaveCount(0);
  await tv.screenshot({ path: 'test-results/screens/tv-home.png' });

  // Game computer: start screen; Create lobby opens the lobby with a game straight away (R5-4).
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  pc.on('dialog', (d) => void d.accept());
  await pc.goto(`${BASE}/desk`);
  await expect(pc.getByTestId('create-lobby')).toBeVisible();
  await pc.screenshot({ path: 'test-results/screens/start-screen.png' });
  await pc.getByTestId('create-lobby').click();
  await expect(pc.getByTestId('lobby-open')).toBeVisible();
  await expect(pc.getByTestId('host-status')).toHaveText(/Waiting for the host/);
  // The code arrives a moment after the screen (a "······" placeholder until then).
  await expect(pc.getByTestId('pairing-code')).toHaveText(/^\s*\d{6}\s*$/);
  const code = (await pc.getByTestId('pairing-code').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  await expect(pc.locator('[aria-label="QR code for hostPair page"] svg')).toBeVisible();
  // The pairing QR needs a host session (it contains the temporary code).
  expect((await ctx.get('/api/qr?target=hostPair')).status()).toBe(401);
  await pc.screenshot({ path: 'test-results/screens/start-lobby-open.png' });

  // TV: the active lobby with the (smaller) join QR, the selected board and the rules (R5-3).
  await expect(tv.getByText('Scan to join')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-board')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-rules')).toContainText('Time to buzz in');
  await expect(tv.getByTestId('tv-lobby-rules')).toContainText('Think time');
  await expect(tv.getByTestId('tv-lobby-full')).not.toContainText(code); // the host code never appears on the TV
  const qr = await tv.getByTestId('tv-join-card').boundingBox();
  expect(qr!.width).toBeLessThan(1920 * 0.15); // about 60 % of the old 23vw card
  await tv.screenshot({ path: 'test-results/screens/tv-lobby.png' });

  // iPad: treat it as a separate device and open the link from the QR code.
  await ctx.put('/api/settings', { headers: auth, data: { trustLocalhost: false } });
  try {
    const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
    ipad.on('dialog', (d) => void d.accept());
    await ipad.goto(`${BASE}/host#pair=${code}`);
    await expect(ipad.getByTestId('lobby-manage')).toBeVisible(); // no separate setup screen
    expect(ipad.url()).not.toContain('pair='); // the code does not linger in the address bar
    await expect(pc.getByTestId('host-status')).toHaveText(/Host connected/);
    await expect(ipad.getByTestId('lobby-status')).toContainText('Lobby');
    await expect(ipad.getByTestId('lobby-rules')).toContainText('Early buzz');

    // Host navigation is presented on the TV while "Present on TV" is on.
    await expect(ipad.getByTestId('present-toggle')).toHaveAttribute('aria-checked', 'true');
    await ipad.getByTestId('hostnav-players').click();
    await expect(ipad.getByTestId('present-toggle')).toContainText('TV: Players');
    await expect(tv.locator('[data-testid=tv-present-page][data-page=players]')).toBeVisible();
    await expect(tv.getByTestId('tv-lobby-compact')).toBeVisible();
    await expect(tv.getByTestId('tv-nav-rail')).toBeVisible();
    await ipad.getByTestId('hostnav-teams').click();
    await expect(ipad.getByTestId('present-toggle')).toContainText('TV: Teams');
    await expect(tv.locator('[data-testid=tv-present-page][data-page=teams]')).toBeVisible();
    // Private view: browsing no longer changes the TV.
    await ipad.getByTestId('present-toggle').click();
    await expect(ipad.getByTestId('present-toggle')).toHaveAttribute('aria-checked', 'false');
    await ipad.getByTestId('hostnav-buzzers').click();
    await expect(ipad.getByRole('heading', { name: /Buzzers/ }).first()).toBeVisible();
    await expect(ipad.getByTestId('present-toggle')).toContainText('TV: Teams');
    await ipad.screenshot({ path: 'test-results/screens/host-shell-ipad.png' });
    await expect(tv.locator('[data-testid=tv-present-page][data-page=teams]')).toBeVisible(); // unchanged while private
    await expect(tv.locator('[data-testid=tv-present-page][data-page=buzzers]')).toHaveCount(0);
    await ipad.getByTestId('present-toggle').click();
    await ipad.getByTestId('hostnav-home').click();
    await expect(ipad.getByTestId('present-toggle')).toContainText('TV: Lobby');
    await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();

    // Mode and limits (R5-4.2): the limit controls follow Play As.
    await expect(ipad.getByTestId('max-players')).toBeVisible();
    await ipad.getByTestId('mode-team').click();
    await expect(ipad.getByRole('tab', { name: 'Teams' })).toBeVisible();
    await expect(ipad.getByTestId('mode-team')).toHaveAttribute('aria-pressed', 'true');
    await expect(ipad.getByTestId('team-count-value')).toHaveText('2'); // empty lobby: two team slots
    await expect(ipad.getByTestId('max-players')).toHaveCount(0);
    await ipad.getByTestId('team-count-up').click();
    await expect(ipad.getByTestId('team-card')).toHaveCount(3);
    await ipad.getByTestId('max-per-team-up').click();
    await ipad.getByTestId('max-per-team-up').click();
    await expect(ipad.getByTestId('team-capacity').first()).toHaveText('0 / 2 Players');
    await expect(tv.getByTestId('tv-team-capacity').first()).toHaveText('0 / 2');

    // Board choice (R5-3.3): the TV shows the boards while the host chooses, then only the chosen one.
    await ipad.getByTestId('change-board').click();
    await expect(tv.locator('[data-testid=tv-present-page][data-page=boards]')).toBeVisible();
    await expect(tv.getByTestId('tv-lobby-compact')).toBeVisible();
    const options = ipad.getByTestId('board-option');
    const n = await options.count();
    if (n > 1) {
      const other = ((await options.nth(1).textContent()) ?? '').replace(/\d+ rounds.*$/, '').trim();
      await options.nth(1).click();
      await ipad.getByTestId('use-board').click();
      await expect(ipad.getByTestId('lobby-board')).toContainText(other);
      await expect(tv.getByTestId('tv-lobby-board')).toContainText(other);
    } else {
      await ipad.getByRole('button', { name: 'Cancel' }).click();
    }
    await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
    await ipad.screenshot({ path: 'test-results/screens/host-lobby-controls.png' });
    await tv.screenshot({ path: 'test-results/screens/tv-lobby-teams.png' });

    // Close the lobby from the start screen: the pairing code stops working.
    await pc.getByTestId('start-close-lobby').click();
    await expect(pc.getByTestId('create-lobby')).toBeVisible();
    await expect(ipad.getByTestId('lobby-status')).toHaveText('No lobby open');
    await expect(ipad.getByTestId('host-home')).toBeVisible();
    await expect(tv.getByTestId('tv-home')).toBeVisible();
    const login = await ctx.post('/api/host/login', { data: { code } });
    expect(login.status()).toBe(409);
  } finally {
    await ctx.put('/api/settings', { headers: auth, data: { trustLocalhost: true } });
  }
});

test('old dashboard addresses open the matching host pages', async () => {
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  await pc.goto(`${BASE}/desk/library`);
  await expect(pc).toHaveURL(/\/host\/boards$/);
  await pc.goto(`${BASE}/desk/controllers`);
  await expect(pc).toHaveURL(/\/host\/buzzers$/);
  await expect(pc.getByTestId('hostnav-buzzers')).toHaveAttribute('aria-current', 'page');
});
