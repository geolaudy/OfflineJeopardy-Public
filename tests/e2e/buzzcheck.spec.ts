// E2E (Z11): buzzer check from the host's Buzzers page; the phone shows a test button, the press
// appears on the host with the phone's connection delay.
import { test, expect, chromium, webkit, devices, type Browser } from '@playwright/test';

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

test('buzzer check: phone test button, press listed on the host with its delay', async () => {
  const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
  await phone.goto(`${BASE}/join`);
  await phone.getByTestId('new-profile').click();
  await phone.getByLabel('Your name', { exact: true }).fill('Casey Check');
  await phone.getByLabel('PIN', { exact: true }).fill('2580');
  await phone.getByLabel('Confirm PIN').fill('2580');
  await phone.getByRole('button', { name: 'Create profile' }).click();
  await expect(phone.getByTestId('me-name')).toHaveText('Casey Check');

  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/buzzers`);
  const panel = pc.getByTestId('buzz-check');
  await expect(panel.getByTestId('connections')).toContainText('Casey Check');
  await panel.getByTestId('buzz-check-start').click();
  await expect(panel.getByTestId('buzz-check-waiting')).toContainText('Casey Check');

  await expect(phone.getByTestId('phone-buzz-check')).toBeVisible();
  await phone.getByTestId('phone-buzz-check-button').click();
  await expect(phone.getByTestId('phone-buzz-check-button')).toHaveText('OK!');
  await expect(panel.getByTestId('buzz-check-presses')).toContainText('Casey Check');
  await expect(panel.getByTestId('buzz-check-presses')).toContainText(/\d+ ms/);
  await pc.screenshot({ path: 'test-results/screens/buzz-check-host.png' });
  await phone.screenshot({ path: 'test-results/screens/buzz-check-phone.png' });

  await panel.getByTestId('buzz-check-stop').click();
  await expect(panel.getByTestId('buzz-check-start')).toHaveText(/Check again/);
  await expect(phone.getByTestId('phone-buzz-check')).toHaveCount(0);
});
