// Mobile & tablet layout regression tests (USER_FEEDBACK.md FB-1.1 … FB-1.3, AF1, AF3).
// Playwright emulates viewport sizes and the WebKit engine, not real Safari chrome (toolbars,
// notches): real-device checks are still required before claiming iPhone/iPad compatibility.
import { test, expect, webkit, devices, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const SHOTS = 'test-results/screens';
let wk: Browser;

test.beforeAll(async () => {
  wk = await webkit.launch();
  fs.mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => {
  await wk?.close();
});

async function expectInViewport(page: Page, testIdOrLocator: ReturnType<Page['getByTestId']>, what: string) {
  const box = await testIdOrLocator.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, `${what} is rendered`).not.toBeNull();
  expect(box!.y, `${what} top is on screen`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${what} bottom is on screen`).toBeLessThanOrEqual(vp.height + 1);
}

const PHONES = ['iPhone SE', 'iPhone SE landscape', 'iPhone 13', 'iPhone 13 landscape', 'iPhone 15 Pro Max', 'iPhone 15 Pro Max landscape'] as const;

test('phone portal fits the visible screen on common iPhones (portrait + landscape) and navigation works', async () => {
  let n = 0;
  for (const name of PHONES) {
    n++;
    const ctx = await wk.newContext({ ...devices[name] });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/join`);
    await expectInViewport(page, page.getByTestId('page-title'), `${name}: sign-in header`);

    // Tall dialog (profile creation): its title and close button must never be pushed above the screen.
    await page.getByTestId('new-profile').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectInViewport(page, dialog.getByRole('button', { name: 'Close' }), `${name}: dialog close button`);
    await expectInViewport(page, dialog, `${name}: dialog`);
    await page.waitForTimeout(300); // let the open animation finish for a clean screenshot
    await page.screenshot({ path: `${SHOTS}/phone-${n}-create-dialog.png` });
    await page.getByLabel('Your name', { exact: true }).fill(`Mobile${n}`);
    await page.getByLabel('PIN', { exact: true }).fill('2468');
    await page.getByLabel('Confirm PIN').fill('2468');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await expect(page.getByTestId('me-name')).toHaveText(`Mobile${n}`);

    // Signed-in portal: header (title + menu) fully visible.
    await expectInViewport(page, page.getByTestId('page-title'), `${name}: portal header`);
    await expectInViewport(page, page.getByTestId('nav-menu'), `${name}: menu button`);
    await page.screenshot({ path: `${SHOTS}/phone-${n}-play.png` });

    // Drawer: every destination reachable; current page marked.
    await page.getByTestId('nav-menu').click();
    for (const id of ['nav-play', 'nav-profile', 'nav-stats', 'nav-history', 'nav-leaderboard', 'nav-players', 'nav-settings']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('nav-play')).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phone-${n}-drawer.png` });
    await page.getByTestId('nav-players').click();
    await expect(page.getByTestId('page-title')).toHaveText('Players');
    await page.getByTestId('player-row').filter({ hasText: `Mobile${n}` }).click();
    await expect(page.getByTestId('player-name')).toHaveText(`Mobile${n}`);
    await expectInViewport(page, page.getByTestId('nav-back'), `${name}: back arrow`);
    await page.getByTestId('nav-back').click();
    await expect(page.getByTestId('page-title')).toHaveText('Players');
    // Browser back returns to the previous page inside the portal (no dead end, no leaving the app).
    await page.goBack();
    await expect(page.getByTestId('page-title')).toHaveText('Current game');
    // Escape closes the drawer (keyboard accessible).
    await page.getByTestId('nav-menu').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nav-settings')).toHaveCount(0);
    await ctx.close();
  }
});

for (const name of ['iPad Pro 11', 'iPad Pro 11 landscape', 'iPad Mini'] as const) {
  test(`host controller on ${name}: header visible, drawer menu, dialogs keep focus during live updates`, async () => {
    const ctx = await wk.newContext({ ...devices[name] });
    const ipad = await ctx.newPage();
    await ipad.goto(`${BASE}/host`);
    // The picker (or setup) loads with a fully visible header.
    const create = ipad.getByRole('button', { name: 'Open lobby' });
    await expect(create.or(ipad.getByTestId('start-game')).or(ipad.getByTestId('nav-back')).first()).toBeVisible();
    // A finished game may still be loaded (results screen): the back arrow returns to the game list.
    if (!(await create.isVisible()) && !(await ipad.getByTestId('start-game').isVisible())) await ipad.getByTestId('nav-back').click();
    await expect(create.or(ipad.getByTestId('start-game'))).toBeVisible();
    if (await create.isVisible()) await create.click();
    await expect(ipad.getByTestId('start-game')).toBeVisible();
    await expectInViewport(ipad, ipad.getByTestId('nav-menu'), `${name}: host menu button`);
    await expectInViewport(ipad, ipad.getByTestId('nav-back'), `${name}: host back arrow`);
    await ipad.screenshot({ path: `${SHOTS}/host-${name.replace(/\s+/g, '-')}-setup.png` });

    await ipad.getByTestId('nav-menu').click();
    await ipad.getByRole('button', { name: /Rules & timers/ }).click();
    const dialog = ipad.getByRole('dialog', { name: 'Rules & timers' });
    await expect(dialog).toBeVisible();
    await expectInViewport(ipad, dialog.getByRole('button', { name: 'Close' }), `${name}: rules dialog close`);
    await dialog.getByRole('radio', { name: /Short lockout/ }).click();
    const secs = dialog.getByLabel('Lockout seconds');
    await secs.fill('1.5');
    await secs.focus();

    // A live state update arrives while the host is typing (a phone joins the game).
    const phone = await (await wk.newContext({ ...devices['iPhone 13'] })).newPage();
    await phone.goto(`${BASE}/join`);
    await phone.getByTestId('new-profile').click();
    await phone.getByLabel('Your name', { exact: true }).fill(`Joiner ${name}`.slice(0, 20));
    await phone.getByLabel('PIN', { exact: true }).fill('1111');
    await phone.getByLabel('Confirm PIN').fill('1111');
    await phone.getByRole('button', { name: 'Create profile' }).click();
    await phone.getByTestId('join-game').click();
    await expect(ipad.getByTestId('setup-player').filter({ hasText: 'Joiner' })).toHaveCount(1);
    // Regression (AF3): the update must not move focus or reset what the host typed.
    await expect(secs).toBeFocused();
    await expect(secs).toHaveValue('1.5');
    await dialog.getByRole('button', { name: 'Save rules' }).click();
    await expect(dialog).toHaveCount(0);

    // Leave the game list clean for the next test.
    await ipad.getByTestId('nav-back').click();
    await expect(ipad.getByRole('button', { name: 'Open lobby' })).toBeVisible();
    await phone.context().close();
    await ctx.close();
  });
}
