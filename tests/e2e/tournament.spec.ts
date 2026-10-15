// E2E (O8): create a tournament, play a game in it, see the standings on the host and the TV.
import { test, expect, chromium, request, type Browser } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterEach(async () => {
  for (const c of cr?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
});

test('tournament: create, choose it for a game, standings after the game on host and TV', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const token = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${token}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/profiles', { data: { name: 'Tori Tourney', color: '#16a34a', avatar: 'fox', pin: '4680' } });

  const tv = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  pc.on('dialog', (d) => void d.accept());

  // Create the tournament.
  await pc.goto(`${BASE}/host/tournaments`);
  await pc.getByTestId('new-tournament').click();
  await pc.getByLabel('Tournament name').fill('Autumn Cup');
  await pc.getByTestId('save-tournament').click();
  await expect(pc.getByRole('heading', { name: 'Autumn Cup' })).toBeVisible();

  // Set up a game that belongs to it.
  await pc.getByTestId('hostnav-home').click();
  await pc.getByRole('button', { name: /^Starter Trivia Night/ }).first().click();
  await pc.getByTestId('tournament-select').selectOption({ label: 'Autumn Cup — game 1' });
  await expect(pc.getByTestId('setup-summary')).toContainText('Autumn Cup (game 1)');
  await pc.getByTestId('open-lobby').click();
  await pc.getByRole('button', { name: '+ Add player' }).click();
  await pc.getByRole('dialog').getByRole('button', { name: /Tori Tourney/ }).click();
  await pc.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await pc.getByTestId('start-game').click();
  await pc.getByTestId('intro-skip').click();
  await pc.getByRole('button', { name: 'Game menu' }).click();
  await pc.getByRole('button', { name: 'End game' }).click();

  // Standings on the host results, then on the TV.
  const standings = pc.getByTestId('tournament-results');
  await expect(standings).toContainText('Autumn Cup');
  await expect(standings).toContainText('Tori Tourney');
  await expect(standings).toContainText('5 pts');
  await standings.getByTestId('present-standings').click();
  const page = tv.locator('[data-testid=tv-present-page][data-page=tournament]');
  await expect(page).toContainText('Autumn Cup');
  await expect(page).toContainText('Tori Tourney');
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: 'test-results/screens/tv-tournament.png' });

  // The player sees the standings on their phone, with their own row marked.
  const phone = await (await cr.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`${BASE}/join`);
  const search = phone.getByLabel('Find your name');
  if (await search.isVisible().catch(() => false)) await search.fill('Tori');
  await phone.getByTestId('profile-tile').filter({ hasText: 'Tori Tourney' }).click();
  for (const d of '4680') await phone.getByRole('button', { name: d, exact: true }).click();
  await expect(phone.getByTestId('me-name')).toHaveText('Tori Tourney');
  await phone.goto(`${BASE}/join/tournaments`);
  await expect(phone.getByTestId('phone-standing').first()).toContainText('Tori Tourney');
  await expect(phone.getByTestId('phone-standing').first()).toContainText('(you)');
  await phone.screenshot({ path: 'test-results/screens/phone-tournament.png' });

  // The tournament page lists the game.
  await pc.getByRole('link', { name: 'Full standings' }).click();
  await expect(pc.getByTestId('standings')).toContainText('Tori Tourney');
  await pc.getByTestId('finish-tournament').click();
  await expect(pc.getByText('finished', { exact: false }).first()).toBeVisible();

  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
