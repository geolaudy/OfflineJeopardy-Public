// E2E (R2-1..R2-8): the game computer's start screen creates a lobby, the iPad pairs in one step
// from the lobby QR link, the start screen sees the host connect, the host's navigation is
// presented on the TV (and stops in private view), and closing the lobby retires the pairing code.
import { test, expect, chromium, webkit, devices, request, type Browser } from '@playwright/test';

const BASE = 'http://127.0.0.1:3210';
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

  // Game computer: start screen
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  pc.on('dialog', (d) => void d.accept());
  await pc.goto(`${BASE}/desk`);
  await expect(pc.getByTestId('create-lobby')).toBeVisible();
  await pc.screenshot({ path: 'test-results/screens/start-screen.png' });
  await pc.getByTestId('create-lobby').click();
  await expect(pc.getByTestId('lobby-open')).toBeVisible();
  await expect(pc.getByTestId('host-status')).toHaveText(/Waiting for the host/);
  const code = (await pc.getByTestId('pairing-code').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  await expect(pc.locator('[aria-label="QR code for hostPair page"] svg')).toBeVisible();
  // The pairing QR needs a host session (it contains the temporary code).
  expect((await ctx.get('/api/qr?target=hostPair')).status()).toBe(401);
  await pc.screenshot({ path: 'test-results/screens/start-lobby-open.png' });

  // TV
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-full')).toContainText(/Waiting for the host/);
  await expect(tv.getByTestId('tv-lobby-full')).not.toContainText(code); // the host code never appears on the TV

  // iPad: treat it as a separate device and open the link from the QR code.
  await ctx.put('/api/settings', { headers: auth, data: { trustLocalhost: false } });
  try {
    const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
    await ipad.goto(`${BASE}/host#pair=${code}`);
    await expect(ipad.getByRole('heading', { name: 'Set up a game' })).toBeVisible();
    expect(ipad.url()).not.toContain('pair='); // the code does not linger in the address bar
    await expect(pc.getByTestId('host-status')).toHaveText(/Host connected/);
    await expect(ipad.getByTestId('lobby-status')).toContainText('Lobby');

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

    // Set up and open the lobby, then change mode and board before starting (R2-6).
    ipad.on('dialog', (d) => void d.accept());
    await ipad.getByRole('button', { name: /Starter Trivia Night/ }).first().click();
    await expect(ipad.getByTestId('setup-summary')).toContainText('Starter Trivia Night');
    await ipad.getByTestId('open-lobby').click();
    await expect(ipad.getByTestId('lobby-controls')).toBeVisible();
    await expect(tv.getByText('Scan to join')).toBeVisible();
    await tv.screenshot({ path: 'test-results/screens/tv-lobby.png' });
    await expect(ipad.getByRole('tab', { name: '1. Players' })).toBeVisible();
    await ipad.getByTestId('mode-team').click();
    await expect(ipad.getByRole('tab', { name: '1. Teams' })).toBeVisible();
    await expect(ipad.getByTestId('mode-team')).toHaveAttribute('aria-pressed', 'true');
    const boardSelect = ipad.getByLabel('Board', { exact: true });
    const options = await boardSelect.locator('option').allTextContents();
    const other = options.find((o) => !o.includes('Starter Trivia Night'));
    if (other) {
      await boardSelect.selectOption({ label: other });
      await expect(ipad.getByTestId('phase')).toBeVisible();
      await expect(ipad.getByRole('heading', { level: 1 })).toContainText(other);
    }
    await ipad.screenshot({ path: 'test-results/screens/host-lobby-controls.png' });

    // Close the lobby from the start screen: the pairing code stops working.
    await pc.getByTestId('start-close-lobby').click();
    await expect(pc.getByTestId('create-lobby')).toBeVisible();
    await expect(ipad.getByTestId('lobby-status')).toHaveText('No lobby open');
    await expect(tv.getByText(/create a lobby on the game computer/)).toBeVisible();
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
