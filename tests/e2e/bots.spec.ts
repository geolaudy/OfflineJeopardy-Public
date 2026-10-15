// Computer opponents as real players (R3-9/10/13): a bot picks a clue when it has control, its
// answer appears on the host (with the expected answer, privately) and on the TV (without it), the
// timer stops, and nothing is scored until the host judges.
import { test, expect, chromium, request, type Browser } from '@playwright/test';
import { hostSocket } from './hostSocket';

const BASE = 'http://127.0.0.1:3210';
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

test('bot picks a clue, gives a visible answer and waits for the host to judge it', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const human = (await (await api.post('/api/profiles', { data: { name: 'Bot Tester', color: '#7c3aed', avatar: 'cat', pin: '1122' } })).json()).profile.id as string;
  await api.post('/api/lobby', { headers: H, data: { name: 'Bot night' } });
  const board = ((await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[]).find((b) => b.title === 'Starter Trivia Night')!;
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });

  const h = await hostSocket(host);
  await h.until((g) => !!g);
  await h.act({ type: 'addPlayer', profileId: human });
  await h.act({ type: 'addBot', name: 'Turing Tess', level: 'hard' });
  const g0 = await h.until((g) => g.competitors.length === 2);
  const tess = g0.competitors.find((c: any) => c.bot).id;
  await h.act({ type: 'updateRules', rules: { ...g0.rules, categoryIntro: false, timers: { ...g0.rules.timers, answerSeconds: 6 } } });
  await h.act({ type: 'startGame' });

  const tv = await (await cr.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host`);

  // The bot has control → it chooses a clue by itself after looking at the board.
  await h.act({ type: 'setControl', competitorId: tess });
  await expect(tv.getByTestId('clue-text')).toBeVisible({ timeout: 10_000 });
  const g1 = await h.until((g) => g.phase === 'clue');
  expect(g1.clue.clueId).toBeTruthy();

  // Host lets the bot answer (deterministic: "buzz for" the bot after unlocking).
  await h.act({ type: 'unlockBuzzers' });
  const g2 = await h.until((g) => g.buzzer.status === 'open' || !!g.buzzer.winner);
  if (!g2.buzzer.winner) await h.act({ type: 'hostBuzz', competitorId: tess }).catch(() => {});
  await expect(pc.getByTestId('host-winner')).toHaveText('Turing Tess');
  await expect(pc.getByTestId('bot-answer-panel')).toBeVisible();
  await expect(pc.getByTestId('bot-answer')).toBeVisible({ timeout: 8000 });
  await expect(pc.getByText('Awaiting your judgment')).toBeVisible();
  await expect(pc.getByTestId('bot-expected')).toBeVisible(); // private, host only
  const answer = (await pc.getByTestId('bot-answer').innerText()).replace(/[“”]/g, '');
  await expect(tv.getByTestId('tv-bot-answer')).toHaveText(`“${answer}”`);
  await expect(tv.getByTestId('clue-answer')).toHaveCount(0); // the expected answer stays hidden on the TV
  const waiting = await h.until((g) => !!g.clue?.submission);
  expect(waiting.timer).toBeNull(); // the answer timer stopped
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: 'test-results/screens/tv-bot-answer.png' });
  await pc.getByTestId('bot-answer-panel').screenshot({ path: 'test-results/screens/host-bot-judgment.png' });
  await pc.waitForTimeout(6500); // longer than the 6 s answer timer: still waiting for the host
  await expect(pc.getByTestId('bot-answer')).toBeVisible();
  await pc.getByTestId('incorrect').click();
  const g3 = await h.until((g) => g.clue?.submission == null && g.buzzer.attemptedCompetitors.includes(tess));
  expect(g3.competitors.find((c: any) => c.id === tess).score).toBeLessThan(0);

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});

test('AI answers settings: key is saved write-only, nothing is sent until enabled (R3-14)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const external: string[] = [];
  pc.on('request', (r) => (!r.url().startsWith(BASE) && !r.url().startsWith('data:') ? external.push(r.url()) : undefined));
  await pc.goto(`${BASE}/host/settings`);
  const card = pc.getByTestId('ai-settings');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('ai-status')).toContainText('No API key saved');
  await card.getByTestId('ai-key').fill('sk-ant-e2e-fake-key-1234567');
  await card.getByTestId('ai-save-key').click();
  await expect(card.getByTestId('ai-key')).toHaveValue('');
  await expect(card.getByTestId('ai-key')).toHaveAttribute('placeholder', /saved/);
  await card.getByTestId('ai-enabled').check();
  await expect(card.getByTestId('ai-status')).toContainText('AI answers are on');
  await card.screenshot({ path: 'test-results/screens/settings-ai.png' });
  const st = await (await api.get('/api/ai', { headers: H })).json();
  expect(st).toMatchObject({ keySaved: true, ready: true });
  expect(JSON.stringify(st)).not.toContain('sk-ant-e2e');
  expect(await pc.content()).not.toContain('sk-ant-e2e-fake-key');
  expect(external).toEqual([]); // the browser never talks to the AI provider
  // Local AI (Ollama, LM Studio): a server address instead of a required key.
  await api.put('/api/ai', { headers: H, data: { clearKey: true } });
  await pc.reload();
  await card.getByLabel('AI provider').selectOption('openai');
  await expect(card.getByTestId('ai-base-url')).toHaveValue('http://127.0.0.1:11434/v1');
  await expect(card.getByTestId('ai-model-input')).toHaveValue('llama3.2');
  await expect(card.getByTestId('ai-test')).toBeEnabled(); // no key needed
  await expect(card.getByText(/optional — local servers usually need none/)).toBeVisible();
  await expect.poll(async () => (await (await api.get('/api/ai', { headers: H })).json()).config.provider).toBe('openai');
  await api.put('/api/ai', { headers: H, data: { config: { ...st.config, enabled: false }, clearKey: true } });
  await api.dispose();
});
