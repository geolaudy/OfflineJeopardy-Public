// Lobby cards with history (R3-6/7/8): after a counted game and Return to Lobby the TV shows each
// player's games and wins, a crown on the previous winner, the wins leader and the bot's level.
import { test, expect, chromium, request, type Browser } from '@playwright/test';
import WebSocket from 'ws';

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

/** Minimal host WebSocket client: sends engine actions and waits for each result. */
async function hostSocket(token: string) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  let state: any = null;
  const pending = new Map<number, (m: any) => void>();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'state') state = m.game;
    if (m.t === 'result') pending.get(m.id)?.(m);
  });
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token }));
  let id = 1;
  const act = (action: Record<string, unknown>) =>
    new Promise<any>((res, rej) => {
      const n = id++;
      pending.set(n, (m) => (m.ok ? res(m) : rej(new Error(`${action.type}: ${m.error}`))));
      ws.send(JSON.stringify({ t: 'host', id: n, action }));
    });
  const until = async (pred: (g: any) => boolean) => {
    for (let i = 0; i < 100 && !(state && pred(state)); i++) await new Promise((r) => setTimeout(r, 30));
    return state;
  };
  return { act, until, close: () => ws.close() };
}

test('lobby cards show games, wins, the crown for the last winner and the wins leader', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const mk = async (name: string, color: string, avatar: string) => (await (await api.post('/api/profiles', { data: { name, color, avatar, pin: '2468' } })).json()).profile.id as string;
  const ada = await mk('Ada Lobby', '#dc2626', 'fox');
  const ben = await mk('Ben Lobby', '#059669', 'owl');
  await api.post('/api/lobby', { headers: H, data: { name: 'Stats night' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const board = boards.find((b) => b.title === 'Starter Trivia Night')!;
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });

  const h = await hostSocket(host);
  await h.until((g) => !!g);
  await h.act({ type: 'addPlayer', profileId: ada });
  await h.act({ type: 'addPlayer', profileId: ben });
  await h.act({ type: 'addBot', name: 'Gizmo Gus', level: 'medium' });
  const g = await h.until((x) => x.competitors.length === 3);
  const adaC = g.competitors.find((c: any) => c.profileId === ada).id;
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' }).catch(() => {});
  await h.act({ type: 'selectClue', clueId: 'tech_3' });
  await h.act({ type: 'unlockBuzzers' });
  await h.act({ type: 'hostBuzz', competitorId: adaC });
  await h.act({ type: 'judge', result: 'correct' });
  await h.act({ type: 'closeClue' }).catch(() => {});
  await h.act({ type: 'endGame' });
  expect((await api.post('/api/games/current/rematch', { headers: H })).ok()).toBe(true);
  h.close();

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  const adaCard = tv.getByTestId('tv-lobby-player').filter({ hasText: 'Ada Lobby' });
  const benCard = tv.getByTestId('tv-lobby-player').filter({ hasText: 'Ben Lobby' });
  const bot = tv.getByTestId('tv-lobby-player').filter({ hasText: 'Gizmo Gus' });
  await expect(adaCard.getByTestId('tv-player-stats')).toHaveText('1 game · 1 win');
  await expect(benCard.getByTestId('tv-player-stats')).toHaveText('1 game · 0 wins');
  await expect(adaCard.getByTestId('tv-crown')).toBeVisible();
  await expect(adaCard.getByTestId('tv-leader')).toBeVisible();
  await expect(benCard.getByTestId('tv-crown')).toHaveCount(0);
  await expect(bot.getByTestId('tv-bot-level')).toHaveText('Medium');
  await expect(bot.getByTestId('tv-player-stats')).toHaveCount(0);
  await expect(tv.getByTestId('tv-lobby-legend')).toContainText('Won the last game');
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: 'test-results/screens/tv-lobby-stats.png' });

  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
