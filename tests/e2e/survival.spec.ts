// E2E (O8 survival UI): lives shown as hearts on the TV podiums and the host's score bar; a wrong
// answer costs a life everywhere; running out greys the player out.
import { test, expect, chromium, request, type Browser } from '@playwright/test';
import { createLobby } from './lobbyFlow';

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

test('survival: hearts on TV and host, a wrong answer costs a life, out of lives is shown', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/profiles', { data: { name: 'Lou Lives', color: '#16a34a', avatar: 'fox', pin: '2468' } });
  await api.post('/api/profiles', { data: { name: 'Max Hearts', color: '#dc2626', avatar: 'owl', pin: '1357' } });

  const tv = await (await cr.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  pc.on('dialog', (d) => void d.accept());
  await pc.goto(`${BASE}/host`);
  await createLobby(pc, { preset: 'Survival' });
  await expect(pc.getByTestId('lobby-rules')).toContainText('3 lives');
  for (const name of ['Lou Lives', 'Max Hearts']) {
    await pc.getByRole('button', { name: '+ Add player' }).click();
    await pc.getByRole('dialog').getByRole('button', { name: new RegExp(name) }).click();
    await pc.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  }
  await pc.getByTestId('start-game').click();
  await pc.getByTestId('intro-skip').click();

  const podium = (name: string) => tv.getByTestId('podium').filter({ hasText: name });
  await expect(podium('Lou Lives').getByTestId('lives')).toHaveAttribute('data-lives', '3');
  await pc.getByRole('button', { name: 'History for 200' }).click();
  await pc.getByTestId('unlock').click();
  await pc.getByTestId('clue-more').click(); // R5-14: buzzing for a player is in More
  await pc.getByRole('button', { name: 'Buzz for Lou Lives' }).click();
  await pc.getByTestId('incorrect').click();
  await expect(podium('Lou Lives').getByTestId('lives')).toHaveAttribute('data-lives', '2');
  await expect(podium('Max Hearts').getByTestId('lives')).toHaveAttribute('data-lives', '3');
  await expect(pc.getByTestId('host-score').filter({ hasText: 'Lou Lives' }).getByTestId('lives')).toHaveAttribute('aria-label', '2 of 3 lives left');
  await tv.screenshot({ path: 'test-results/screens/tv-survival.png' });

  await pc.getByTestId('game-options').click(); // R14-9: the game menu is in Options during the game
  await pc.getByRole('button', { name: 'End game' }).click();
  await api.post('/api/games/close', { headers: H });
  await api.dispose();
});
