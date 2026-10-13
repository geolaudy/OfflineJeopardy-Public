// Single-player practice vs a computer opponent (O3), hosted from the PC with keyboard/mouse.
import { test, expect, chromium, request, type Browser } from '@playwright/test';

const BASE = 'http://127.0.0.1:3210';
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
// Close every page after each test: lingering WebKit contexts slow down later tests on Windows.
test.afterEach(async () => {
  for (const b of [cr]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
});

test('practice game: computer opponent, answer hidden until revealed, buzzers open by themselves, B buzzes', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/profiles', { data: { name: 'Solo Sue', color: '#1d4ed8', avatar: 'owl', pin: '1357' } });

  const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host`);
  await pc.getByRole('button', { name: /Starter Trivia Night/ }).click(); // don't depend on which board is newest
  await pc.getByTestId('practice-toggle').check();
  await pc.getByRole('button', { name: 'Open lobby' }).click();
  await expect(pc.getByTestId('practice-note')).toBeVisible();

  await pc.getByRole('button', { name: '+ Add player' }).click();
  await pc.getByRole('dialog').getByRole('button', { name: /Solo Sue/ }).click();
  await pc.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await pc.getByTestId('add-bot').click();
  await pc.getByRole('dialog').getByRole('radio', { name: /Easy/ }).click();
  await pc.getByTestId('confirm-add-bot').click();
  await expect(pc.getByTestId('setup-bot')).toContainText('Robo Rita');
  await expect(tv.getByText('Robo Rita')).toBeVisible(); // lobby shows the computer player
  await pc.getByTestId('start-game').click();
  await pc.getByTestId('intro-skip').click();

  await pc.getByRole('button', { name: 'History for 200' }).click();
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  // The player is hosting their own game: no spoilers until the answer is revealed.
  await expect(pc.getByTestId('peek-answer')).toBeVisible();
  await expect(pc.getByTestId('host-answer')).toHaveCount(0);
  // Buzzers open automatically after a reading pause; B buzzes for the single human player.
  await expect(pc.getByText('Buzzers are open…')).toBeVisible({ timeout: 10_000 });
  await pc.keyboard.press('b');
  await expect(pc.getByTestId('host-winner')).toHaveText('Solo Sue');
  await expect(tv.getByTestId('buzz-winner')).toContainText('Solo Sue');
  await pc.getByTestId('correct').click();
  await expect(pc.getByTestId('host-answer')).toHaveText('The Inca'); // revealed after judging
  await pc.getByTestId('back-to-board').click();
  await expect(tv.getByTestId('scoreboard')).toContainText('Robo Rita');

  await pc.getByRole('button', { name: 'Game menu' }).click();
  pc.once('dialog', (d) => d.accept());
  await pc.getByRole('button', { name: 'End game' }).click();
  await expect(tv.getByTestId('winner')).toContainText('Solo Sue wins!');
  await api.post('/api/games/close', { headers: H });
  await api.dispose();
});
