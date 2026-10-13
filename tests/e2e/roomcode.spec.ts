// Room codes (P17): host requires the code, TV shows it, phone must type it to join.
import { test, expect, chromium, webkit, devices, request, type Browser } from '@playwright/test';

const BASE = 'http://127.0.0.1:3210';
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
// Close every page after each test: lingering WebKit contexts slow down later tests on Windows.
test.afterEach(async () => {
  for (const b of [wk, cr]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
  await wk?.close();
});

test('room code: required by the host, shown on the TV, typed on the phone', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });

  const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host`);
  await pc.getByRole('button', { name: 'Create game' }).click();
  await pc.getByTestId('require-room-code').click();
  await expect(pc.getByTestId('require-room-code')).toBeChecked();
  const code = (await pc.getByTestId('host-room-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  await expect(tv.getByTestId('tv-room-code')).toContainText(code);

  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('new-profile').click();
  await phone.getByLabel('Your name', { exact: true }).fill('Coder');
  await phone.getByLabel('PIN', { exact: true }).fill('4321');
  await phone.getByLabel('Confirm PIN').fill('4321');
  await phone.getByRole('button', { name: 'Create profile' }).click();
  await expect(phone.getByTestId('join-game')).toBeDisabled();
  await phone.getByTestId('room-code-input').fill(code === 'QQQQ' ? 'WWWW' : 'QQQQ');
  await phone.getByTestId('join-game').click();
  await expect(phone.getByTestId('join-error')).toContainText('room code');
  await phone.getByTestId('room-code-input').fill(code.toLowerCase());
  await expect(phone.getByTestId('room-code-input')).toHaveValue(code);
  await phone.getByTestId('join-game').click();
  await expect(pc.getByTestId('setup-player').filter({ hasText: 'Coder' })).toHaveCount(1);
  expect(await phone.content()).not.toContain(`>${code}<`);

  await api.post('/api/games/close', { headers: H });
  await api.dispose();
});
