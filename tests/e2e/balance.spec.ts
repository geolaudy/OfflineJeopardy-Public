// E2E (T11): players without a team are split into evenly matched teams from the lobby.
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

/** Sends host actions over a WebSocket (what the host controller does). */
async function hostSocket(token: string) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token }));
  let id = 1;
  return {
    act: (action: object) =>
      new Promise<void>((resolve, reject) => {
        const my = id++;
        const on = (raw: WebSocket.RawData) => {
          const m = JSON.parse(raw.toString());
          if (m.t === 'result' && m.id === my) {
            ws.off('message', on);
            m.ok ? resolve() : reject(new Error(m.error));
          }
        };
        ws.on('message', on);
        ws.send(JSON.stringify({ t: 'host', id: my, action }));
      }),
    close: () => ws.close(),
  };
}

test('balanced teams: four players without a team become two teams of two', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const token = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${token}` };
  await api.post('/api/games/close', { headers: H });
  await api.post('/api/lobby', { headers: H, data: {} });
  const boards = await (await api.get('/api/boards', { headers: H })).json();
  const starter = boards.find((b: { title: string }) => b.title === 'Starter Trivia Night');
  const game = await (await api.post('/api/games', { headers: H, data: { boardId: starter.id, mode: 'team' } })).json();
  const ids: string[] = [];
  for (const [i, name] of ['Bea Balance', 'Ben Balance', 'Bo Balance', 'Bix Balance'].entries()) {
    const p = await (await api.post('/api/profiles', { data: { name, color: '#1d4ed8', avatar: 'owl', pin: `135${i}` } })).json();
    ids.push(p.profile?.id ?? p.id);
  }
  const host = await hostSocket(token);
  for (const id of ids) await host.act({ type: 'addPlayer', profileId: id });

  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host`);
  const card = pc.getByTestId('balance-teams');
  await expect(card).toContainText('4 players without a team');
  await card.getByTestId('balance-open').click();
  await card.getByTestId('balance-count-2').click();
  const preview = card.getByTestId('balance-preview');
  await expect(preview.locator('> div')).toHaveCount(2);
  await card.getByTestId('balance-shuffle').click();
  await pc.screenshot({ path: 'test-results/screens/balance-teams.png' });
  await card.getByTestId('balance-create').click();
  await expect(pc.getByTestId('team-card')).toHaveCount(2);
  for (const t of await pc.getByTestId('team-card').allTextContents()) expect(t).toContain('2 players');
  await expect(pc.getByTestId('balance-teams')).toHaveCount(0); // everyone has a team now

  host.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete(`/api/games/${game.id}`, { headers: H }); // leave no unfinished game behind
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
