// E2E (T10): head to head from a phone ("Compare with me") and from the host's Players page.
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

test('head to head on the phone and on the host', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const rival = await (await api.post('/api/profiles', { data: { name: 'Riley Rival', color: '#dc2626', avatar: 'fox', pin: '9753' } })).json();
  const rivalId = rival.profile?.id ?? rival.id;

  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('new-profile').click();
  await phone.getByLabel('Your name', { exact: true }).fill('Morgan Me');
  await phone.getByLabel('PIN', { exact: true }).fill('8642');
  await phone.getByLabel('Confirm PIN').fill('8642');
  await phone.getByRole('button', { name: 'Create profile' }).click();
  await expect(phone.getByTestId('me-name')).toHaveText('Morgan Me');
  await phone.goto(`${BASE}/join/players/${rivalId}`);
  await phone.getByTestId('compare-with-me').click();
  const h2h = phone.getByTestId('head-to-head');
  await expect(h2h).toContainText('Morgan Me');
  await expect(h2h).toContainText('Riley Rival');
  await expect(h2h.getByTestId('h2h-record')).toContainText('No games against each other yet');
  await phone.screenshot({ path: 'test-results/screens/phone-compare.png' });

  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/players`);
  await pc.getByRole('button', { name: 'Compare Riley Rival' }).click();
  await pc.getByLabel('Compare with').selectOption({ label: 'Morgan Me' });
  await expect(pc.getByRole('dialog').getByTestId('head-to-head')).toContainText('Morgan Me');
  await api.dispose();
});
