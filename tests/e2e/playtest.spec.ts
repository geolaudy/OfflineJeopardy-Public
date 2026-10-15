// Play-test (round 4): a whole evening on unusual screens — iPad in portrait, a 4:3 TV, three
// phones (two players share a preferred colour). Pre-lobby → open lobby → colour clash → category
// intro → wrong answer re-opens the buzzers → Daily Double! → Final Jeopardy! with a missing wager
// and an answer that was typed but never sent → one-at-a-time reveal → Return to Lobby → a second
// game in the same lobby → a Final nobody qualifies for. Screenshots go to test-results/screens.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3210';
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/playtest-${name}.png` });
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

async function phone(token: string, device: (typeof devices)[string], browser: Browser) {
  const p = await (await browser.newContext({ ...device })).newPage();
  await p.addInitScript((t) => localStorage.setItem('oj.profileToken', t), token);
  await p.goto(`${BASE}/join`);
  return p;
}

test('play-test: a full evening on an iPad in portrait, a 4:3 TV and three phones', async () => {
  test.setTimeout(240_000);
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.delete('/api/lobby', { headers: H });
  await api.post('/api/games/close', { headers: H });
  const mk = async (name: string, color: string) => (await (await api.post('/api/profiles', { data: { name, color, avatar: 'owl', pin: '1234' } })).json()) as { token: string; profile: { id: string } };
  const [ivy, jon, kai] = [await mk('Ivy Play', '#b91c1c'), await mk('Jon Play', '#b91c1c'), await mk('Kai Play', '#15803d')];

  const tv = await (await cr.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await api.post('/api/lobby', { headers: H, data: { name: 'Play-test night' } });
  await expect(tv.getByTestId('tv-prelobby')).toBeVisible();
  await expect(tv.getByText('Scan to join')).toHaveCount(0);

  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage(); // portrait
  ipad.on('dialog', (d) => void d.accept());
  await ipad.goto(`${BASE}/host`);
  await ipad.getByRole('button', { name: /Starter Trivia Night/ }).first().click();
  await expect(tv.getByTestId('tv-prelobby-board')).toHaveText('Starter Trivia Night');
  await tv.waitForTimeout(700);
  await shot(tv, 'tv43-prelobby');
  await ipad.getByTestId('open-lobby').click();
  await expect(tv.getByText('Scan to join')).toBeVisible();

  // Phones join; Ivy and Jon both prefer red — the second to arrive is asked to choose.
  const [pi, pj, pk] = [await phone(ivy.token, devices['iPhone 13'], wk), await phone(jon.token, devices['Pixel 7'], cr), await phone(kai.token, devices['iPhone SE'], wk)];
  await pi.getByTestId('join-game').click();
  await expect(ipad.getByTestId('setup-player')).toHaveCount(1);
  await pj.getByTestId('join-game').click();
  await pk.getByTestId('join-game').click();
  await expect(ipad.getByTestId('setup-player')).toHaveCount(3);
  await expect(pj.getByTestId('color-choice')).toBeVisible();
  await expect(pi.getByTestId('color-choice')).toHaveCount(0);
  await expect(pj.getByTestId('color-taken').first()).toBeDisabled();
  await shot(pj, 'phone-color-choice');
  await pj.getByTestId('color-free').first().click();
  await expect(pj.getByTestId('color-choice')).toHaveCount(0);
  await tv.waitForTimeout(500);
  await shot(tv, 'tv43-lobby');

  // Start: the categories come first; no clue tiles on the iPad until they are presented.
  await ipad.getByTestId('start-game').click();
  await expect(ipad.getByTestId('intro-controls')).toBeVisible();
  await expect(ipad.getByTestId('host-tile')).toHaveCount(0);
  await ipad.getByTestId('intro-next').click();
  await shot(ipad, 'ipad-portrait-intro');
  await ipad.getByTestId('intro-skip').click();
  await expect(ipad.getByTestId('host-tile')).toHaveCount(30);

  // Clue 1: Ivy is wrong, the buzzers re-open by themselves, Jon gets it.
  await ipad.getByRole('button', { name: 'History for 200' }).click();
  await ipad.getByTestId('unlock').click();
  await pi.getByTestId('buzzer').dispatchEvent('pointerdown');
  await expect(ipad.getByTestId('host-winner')).toHaveText('Ivy Play');
  await shot(ipad, 'ipad-portrait-buzzed');
  await ipad.getByTestId('incorrect').click();
  await expect(ipad.getByTestId('buzzers-open')).toBeVisible();
  await expect(pi.getByTestId('buzzer')).not.toHaveAttribute('data-state', 'open'); // Ivy already tried
  await pj.getByTestId('buzzer').dispatchEvent('pointerdown');
  await ipad.getByTestId('correct').click();
  await expect(tv.getByTestId('clue-answer')).toBeVisible();
  await ipad.getByTestId('back-to-board').click();

  // Clue 2: Kai answers right.
  await ipad.getByRole('button', { name: 'Geography for 400' }).click();
  await ipad.getByTestId('unlock').click();
  await pk.getByTestId('buzzer').dispatchEvent('pointerdown');
  await ipad.getByTestId('correct').click();
  await ipad.getByTestId('back-to-board').click();

  // Daily Double! for Kai (who now picks): Kai wagers 100 on the phone (R5-20), correct.
  await ipad.getByRole('button', { name: /Science for 800/ }).click();
  await expect(tv.getByText('DAILY DOUBLE!')).toBeVisible();
  await expect(pj.getByTestId('phone-daily-wager')).toHaveCount(0); // not Jon's
  await pk.getByTestId('phone-dd-input').fill('100');
  await pk.getByTestId('phone-dd-submit').click();
  await expect(pk.getByTestId('phone-dd-done')).toBeVisible();
  await expect(ipad.getByTestId('host-dd-pending')).toContainText('100');
  await expect(tv.getByTestId('clue-text')).toHaveCount(0);
  await ipad.getByTestId('host-dd-lock').click();
  await expect(tv.getByTestId('clue-text')).toBeVisible();
  await ipad.getByTestId('correct').click();
  await ipad.getByTestId('back-to-board').click();

  // Final Jeopardy! from Options. Ivy (negative) only watches.
  await ipad.getByTestId('game-options').click();
  await ipad.getByTestId('option-start-final').click();
  await expect(ipad.getByTestId('final-control')).toBeVisible();
  await expect(pi.getByText(/you're watching this one/)).toBeVisible();
  await ipad.getByTestId('final-next').click(); // open wagers
  // Jon wagers everything he has; Kai never wagers (counts as 0).
  const jonMax = Number((await pj.getByText(/Wager between 0 and/).textContent())!.match(/and ([\d,]+)/)![1].replace(/,/g, ''));
  await pj.getByLabel('Your wager').fill(String(jonMax));
  await pj.getByTestId('phone-final-wager-submit').click();
  await expect(pj.getByTestId('phone-final-wager-done')).toBeVisible();
  await expect(ipad.getByTestId('final-control')).not.toContainText(String(jonMax) + '\n');
  await ipad.getByTestId('final-next').click(); // lock (confirm: Kai missing) → clue + think time
  await expect(pj.getByLabel('Your answer')).toBeVisible();
  await pj.getByLabel('Your answer').fill('Buda');
  await pj.getByTestId('phone-final-answer-submit').click();
  // Kai types but never presses Submit — the text is kept as a draft and counts (R5-19).
  await pk.getByLabel('Your answer').fill('Budapest');
  await expect(pk.getByTestId('phone-final-answer')).toHaveAttribute('data-draft-saved', 'true', { timeout: 5000 });
  await expect(ipad.getByTestId('final-status').filter({ hasText: 'Jon Play' })).toContainText('Answered ✓');
  await expect(ipad.getByTestId('final-status').filter({ hasText: 'Kai Play' })).toContainText('Waiting…');
  // TV: green border for Jon (submitted), gray for Kai.
  await expect(tv.getByTestId('tv-final-status').getByText('Jon Play')).toHaveAttribute('data-done', 'true');
  await expect(tv.getByTestId('tv-final-status').getByText('Kai Play')).toHaveAttribute('data-done', 'false');
  // Jon's phone shows the read-only answer with Change answer.
  await expect(pj.getByTestId('phone-final-answer-done')).toContainText('Buda');
  await shot(ipad, 'ipad-portrait-final-answers');
  await ipad.getByTestId('final-next').click(); // close answers → reveal
  // Lowest score first: Jon (200 or 300) before Kai.
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Jon Play');
  await ipad.getByTestId('final-reveal-next').click();
  await expect(tv.getByTestId('tv-final-wager')).toContainText(String(jonMax));
  await ipad.getByTestId('final-reveal-next').click();
  await expect(tv.getByTestId('tv-final-answer')).toHaveText('Buda');
  await ipad.getByTestId('final-incorrect').click();
  await shot(tv, 'tv43-final-verdict');
  await ipad.getByTestId('final-reveal-next').click();
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Kai Play');
  await ipad.getByTestId('final-reveal-next').click();
  await expect(tv.getByTestId('tv-final-wager')).toContainText('0');
  await ipad.getByTestId('final-reveal-next').click();
  await expect(tv.getByTestId('tv-final-answer')).toHaveText('Budapest');
  await ipad.getByTestId('final-correct').click();
  await ipad.getByTestId('final-reveal-next').click(); // finish
  await ipad.getByTestId('end-game').click();
  await expect(tv.getByTestId('winner')).toContainText('Kai Play wins!');
  await shot(ipad, 'ipad-portrait-results');

  // Return to Lobby: same people, same colours, nobody rejoins.
  await ipad.getByTestId('return-to-lobby').click();
  await expect(tv.getByTestId('tv-lobby-player')).toHaveCount(3);
  await expect(ipad.getByTestId('setup-player')).toHaveCount(3);
  await expect(pj.getByTestId('color-choice')).toHaveCount(0); // colour kept, no new prompt

  // Second game: straight to a Final nobody qualifies for (everyone at 0) — it must not get stuck.
  await ipad.getByTestId('start-game').click();
  await ipad.getByTestId('intro-skip').click();
  await ipad.getByTestId('game-options').click();
  await ipad.getByTestId('option-start-final').click();
  await expect(ipad.getByText(/nobody plays Final Jeopardy!/)).toBeVisible();
  await ipad.getByTestId('end-game').click();
  await expect(tv.getByTestId('winner')).toBeVisible();
  await expect(ipad.getByTestId('return-to-lobby')).toBeVisible();
  await api.dispose();
});

test('play-test: a TV that reloads during the round intro does not replay the board fill', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: { name: 'Reload night' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const p = (await (await api.post('/api/profiles', { data: { name: 'Reload Rae', color: '#0e7490', avatar: 'fox', pin: '4321' } })).json()) as { profile: { id: string } };
  const { hostSocket } = await import('./hostSocket');
  const h = await hostSocket(host);
  await h.act({ type: 'addPlayer', profileId: p.profile.id });
  const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startGame' });
  await expect(tv.getByTestId('tv-board-reveal')).toBeVisible(); // fresh: the fill plays
  await tv.waitForTimeout(3000);
  await tv.reload();
  await expect(tv.getByTestId('intro')).toBeVisible();
  await expect(tv.getByTestId('tv-board-reveal')).toHaveCount(0); // not replayed after the reload
  await h.act({ type: 'introSkip' });
  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.dispose();
});

test('play-test: profile creation with a default picture on a small phone, sound packs on an iPad in portrait', async () => {
  const p = await (await wk.newContext({ ...devices['iPhone SE'] })).newPage();
  await p.goto(`${BASE}/join`);
  await p.getByTestId('new-profile').click();
  await p.getByLabel('Your name', { exact: true }).fill('Picture Pat');
  await expect(p.getByTestId('picture-mode-default')).toHaveAttribute('aria-selected', 'true');
  await p.getByRole('radio', { name: 'Unicorn' }).click();
  await expect(p.getByRole('radio', { name: 'Unicorn' })).toHaveAttribute('aria-checked', 'true');
  await expect(p.getByText('Preferred Color')).toBeVisible();
  await shot(p, 'phone-create-profile');
  await p.getByLabel('PIN', { exact: true }).fill('2468');
  await p.getByLabel('Confirm PIN').fill('2468');
  await p.getByRole('button', { name: 'Create profile' }).click();
  await expect(p.getByTestId('me-name')).toHaveText('Picture Pat');

  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11'] })).newPage();
  await ipad.goto(`${BASE}/host/settings`);
  const card = ipad.getByTestId('tv-presentation-settings');
  await expect(card.getByTestId('fx-pack-buzzinga')).toBeVisible();
  await card.getByTestId('fx-pack-buzzinga').scrollIntoViewIfNeeded();
  await shot(ipad, 'ipad-portrait-sound-packs');
  // Leaderboard minimums (K17) save when the field is left.
  const games = ipad.getByLabel('Minimum games');
  await games.fill('2');
  await games.press('Enter');
  const api = await request.newContext({ baseURL: BASE });
  await expect.poll(async () => (await (await api.get('/api/settings/public')).json()).leaderboardThresholds.games).toBe(2);
  await games.fill('3');
  await games.press('Enter');
  await expect.poll(async () => (await (await api.get('/api/settings/public')).json()).leaderboardThresholds.games).toBe(3);
  await api.dispose();
});
