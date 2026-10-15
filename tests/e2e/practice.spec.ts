// Single-player practice vs a computer opponent (O3), hosted from the PC with keyboard/mouse.
import { test, expect, chromium, request, type Browser } from '@playwright/test';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
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
  // TV presentation (R2-23/24): classic board intro + a status-dot unlock indicator.
  const fx = (await (await api.get('/api/settings/public')).json()).tvFx;
  await api.put('/api/settings', { headers: H, data: { tvFx: { ...fx, boardIntro: true, unlock: { ...fx.unlock, style: 'dot', color: '#22c55e' } } } });

  const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host`);
  await pc.getByRole('button', { name: /^Starter Trivia Night/ }).first().click(); // don't depend on which board is newest
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
  await expect(tv.getByTestId('tv-board-reveal')).toBeVisible(); // checker reveal before the round title
  await tv.waitForTimeout(900);
  await tv.screenshot({ path: 'test-results/screens/tv-board-reveal.png' });
  await pc.getByTestId('intro-skip').click();
  await expect(tv.getByTestId('tv-board-reveal')).toHaveCount(0);

  await pc.getByRole('button', { name: 'History for 200' }).click();
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  // The player is hosting their own game: no spoilers until the answer is revealed.
  await expect(pc.getByTestId('peek-answer')).toBeVisible();
  await expect(pc.getByTestId('host-answer')).toHaveCount(0);
  // Buzzers open automatically after a reading pause; B buzzes for the single human player.
  await expect(pc.getByTestId('buzzers-open')).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByTestId('tv-unlock-indicator')).toHaveAttribute('data-style', 'dot');
  await tv.screenshot({ path: 'test-results/screens/tv-unlock-dot.png' });
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

  // Return to Lobby (R3-3): same players and computer opponent, scores start over.
  await expect(pc.getByTestId('return-to-lobby')).toBeVisible();
  await expect(pc.getByTestId('create-new-lobby')).toBeVisible();
  await pc.getByTestId('return-to-lobby').click();
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-player')).toHaveCount(2);
  await expect(tv.getByTestId('tv-bot-level')).toHaveText('Easy'); // R3-5
  await expect(pc.getByTestId('setup-player')).toContainText('Solo Sue');
  await expect(pc.getByTestId('bot-level-badge')).toContainText('Easy');
  await pc.getByLabel('Robo Rita difficulty').selectOption('expert');
  await expect(tv.getByTestId('tv-bot-level')).toHaveText('Expert');
  await tv.waitForTimeout(600);
  await tv.screenshot({ path: 'test-results/screens/tv-lobby-after-return.png' });

  // Leaderboard on the TV from the host's Leaderboard page (R3-2).
  // In Private view the TV stays on the lobby until the host asks for the leaderboard.
  await pc.getByTestId('present-toggle').click();
  await expect(pc.getByTestId('present-toggle')).toHaveAttribute('aria-checked', 'false');
  await pc.getByTestId('hostnav-leaderboard').click();
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  await pc.getByTestId('show-leaderboard-on-tv').click();
  await expect(tv.getByTestId('tv-present-page')).toHaveAttribute('data-page', 'leaderboard');
  await expect(pc.getByTestId('leaderboard-on-tv')).toBeVisible();
  await pc.getByLabel('Ranked by').selectOption({ label: 'Games played' });
  await expect(tv.getByRole('heading', { name: 'Games played' })).toBeVisible();
  await pc.getByRole('tab', { name: 'Teams', exact: true }).click();
  await expect(tv.getByText('Leaderboard · Teams')).toBeVisible();
  await pc.getByTestId('tv-lobby').click();
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();

  // Settings on the TV (R3-4): read-only summary of this game's rules.
  await pc.getByTestId('hostnav-settings').click();
  await pc.getByTestId('show-settings-on-tv').click();
  await expect(tv.getByTestId('tv-settings')).toBeVisible();
  await expect(tv.getByTestId('tv-settings')).toContainText('Buzzers open');
  await expect(tv.getByTestId('tv-settings')).toContainText('Robo Rita (Expert)');
  await expect(tv.locator('.tvp-settings input, .tvp-settings button, .tvp-settings select')).toHaveCount(0);
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: 'test-results/screens/tv-settings.png' });
  await api.post('/api/games/close', { headers: H });
  await api.put('/api/settings', { headers: H, data: { tvFx: fx } });
  await api.dispose();
});

test('TV presentation settings: indicator style, board intro and sound cues save from the Settings page', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  const before = (await (await api.get('/api/settings/public')).json()).tvFx;
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/settings`);
  const card = pc.getByTestId('tv-presentation-settings');
  await expect(card).toBeVisible();
  await card.getByTestId('fx-style-bottom').click();
  await expect(card.getByTestId('fx-style-bottom')).toHaveAttribute('aria-checked', 'true');
  await card.getByTestId('fx-board-intro').uncheck();
  await card.getByTestId('fx-cue-buzz').uncheck();
  // R4-1: four packs as clear options, Jeopardy!/Buzzinga marked as the default.
  await expect(card.getByTestId('fx-pack-buzzinga')).toContainText(/Jeopardy!\/Buzzinga\s*\(Default\)/);
  for (const k of ['classic', 'arcade', 'soft']) await expect(card.getByTestId(`fx-pack-${k}`)).toBeVisible();
  await expect(card.getByTestId('buzzinga-files')).toBeVisible();
  await card.getByTestId('fx-pack-arcade').click();
  await expect(card.getByTestId('fx-pack-arcade')).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByTestId('fx-pack-buzzinga')).toHaveAttribute('aria-checked', 'false');
  await card.screenshot({ path: 'test-results/screens/settings-tv-presentation.png' });
  const after = (await (await api.get('/api/settings/public')).json()).tvFx;
  expect(after.unlock.style).toBe('bottom');
  expect(after.boardIntro).toBe(false);
  expect(after.cues.buzz).toBe(false);
  expect(after.soundPack).toBe('arcade');
  await api.put('/api/settings', { headers: H, data: { tvFx: before } });
  await api.dispose();
});
