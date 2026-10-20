// Round 6 Milestone C (R6-7…R6-11): TV lobby and presented pages at 16:9, 1280×720 and 4:3 — the
// header names the board, one right-hand panel holds the rules and the join QR, the compact lobby
// sits in the top-right corner without covering the page, and nothing overflows horizontally.
import { test, expect, chromium, request, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const SIZES = [
  { name: '1080p', width: 1920, height: 1080 },
  { name: '720p', width: 1280, height: 720 },
  { name: '4x3', width: 1440, height: 1080 },
];
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

const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r6c-${name}.png` });

async function noOverflow(p: Page) {
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(o.sw).toBeLessThanOrEqual(o.cw);
}

/** Nothing inside the element is cut off (its content fits its box). */
const fits = (p: Page, sel: string) => p.locator(sel).first().evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1);

/** Creates a profile through the host's profile administration (no per-device creation limit, so
 *  specs that follow can still create theirs). */
async function mkProfile(api: APIRequestContext, H: Record<string, string>, data: Record<string, string>): Promise<string> {
  const r = await api.post('/api/admin/profiles', { headers: H, data });
  expect(r.ok()).toBe(true);
  return (await r.json()).id;
}

const box = async (p: Page, sel: string) => (await p.locator(sel).first().boundingBox())!;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

test('TV lobby and menu pages: board header, one join + rules panel, compact corner panel, no overflow', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const colors = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5'];
  const names = ['Peggy Quigley', 'Jolly Gary', 'Yuki Pang', 'Ziggy Jones', 'Maggie Q', 'Bob Smith', 'Priya Gupta', 'Jay Young', 'Agatha', 'Quincy'];
  const ids: string[] = [];
  for (let i = 0; i < names.length; i++) ids.push(await mkProfile(api, H, { name: names[i], color: colors[i], avatar: 'fox', pin: '1357' }));
  await api.post('/api/teams', { headers: H, data: { name: 'Quiz Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: ids.slice(0, 3) } });
  await api.post('/api/teams', { headers: H, data: { name: 'Jumping Pygmies', color: '#dc2626', buzzerMode: 'shared', memberIds: ids.slice(3, 6) } });
  await api.post('/api/lobby', { headers: H, data: { name: 'Friday night' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const board = boards.find((b) => b.title === 'Starter Trivia Night')!;
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });

  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const id of ids) await h.act({ type: 'addPlayer', profileId: id });
  await h.act({ type: 'addBot', name: 'Gizmo Gus', level: 'medium' });
  await h.until((x) => x.competitors.length === ids.length + 1);
  h.close();

  // Raw host socket for presenting pages.
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token: host }));
  const present = (req: Record<string, unknown>) => ws.send(JSON.stringify({ t: 'present', req }));

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-player')).toHaveCount(names.length + 1);

  // R6-10: eyebrow "Board", the board's name as the title, metadata row; no separate board card.
  const head = tv.getByTestId('tv-lobby-board');
  await expect(head).toContainText('Board');
  await expect(head).toContainText('Starter Trivia Night');
  await expect(head).toContainText(/\d+ Rounds? • \d+ Clues/);
  await expect(tv.locator('.tvp-side-card')).toHaveCount(0);
  await expect(tv.getByTestId('tv-lobby-full').getByText('Starter Trivia Night')).toHaveCount(1);
  // R6-11: one panel with the rules and the join QR.
  const side = tv.getByTestId('tv-lobby-side');
  await expect(side.getByTestId('tv-lobby-rules')).toContainText('Time to buzz in');
  await expect(side).toContainText('Join the Game');
  await expect(tv.getByTestId('tv-join-url')).toContainText('/join'); // the address, under the QR code (R13-9)

  for (const s of SIZES) {
    await tv.setViewportSize(s);
    await tv.waitForTimeout(900);
    await noOverflow(tv);
    // Cards never run into the side panel.
    const sideBox = await box(tv, '[data-testid=tv-lobby-side]');
    const cards = await tv.getByTestId('tv-lobby-player').all();
    for (const c of cards) expect(overlaps((await c.boundingBox())!, sideBox)).toBe(false);
    const qr = await box(tv, '.tvp-qr-img');
    expect(qr.width).toBeGreaterThan(s.height * 0.15); // still scannable from the sofa
    // The join QR sits inside the one right-hand panel (not a card floating beside it).
    expect(qr.x).toBeGreaterThanOrEqual(sideBox.x);
    expect(qr.x + qr.width).toBeLessThanOrEqual(sideBox.x + sideBox.width + 1);
    expect(qr.y).toBeGreaterThanOrEqual(sideBox.y);
    expect(await fits(tv, '.tvp-side-in')).toBe(true);
    expect(await fits(tv, '.tvp-rules-sec')).toBe(true);
    await shot(tv, `lobby-${s.name}`);
  }

  const pages: [string, Record<string, unknown>][] = [
    ['players', { page: 'players' }],
    ['teams', { page: 'teams' }],
    ['boards', { page: 'boards', boardId: board.id }],
    ['buzzers', { page: 'buzzers' }],
    ['leaderboard', { page: 'leaderboard', view: 'solo' }],
    ['rules', { page: 'rules' }],
  ];
  for (const [name, req] of pages) {
    present(req);
    await expect(tv.locator(`[data-testid=tv-present-page][data-page=${name}]`)).toBeVisible();
    await expect(tv.getByTestId('tv-lobby-compact')).toBeVisible();
    for (const s of SIZES) {
      await tv.setViewportSize(s);
      await tv.waitForTimeout(900);
      await noOverflow(tv);
      // R6-8: the compact panel sits in the top-right corner and never covers the page's content.
      const panel = await box(tv, '[data-testid=tv-lobby-compact]');
      expect(await fits(tv, '.tvp-compact-inner')).toBe(true);
      expect(panel.x + panel.width).toBeGreaterThan(s.width * 0.95);
      expect(panel.y).toBeLessThan(s.height * 0.15);
      const content = await box(tv, '[data-testid=tv-present-page] .tvp-panel');
      expect(overlaps(panel, content)).toBe(false);
      const jc = await box(tv, '[data-testid=tv-join-card]');
      expect(overlaps(jc, content)).toBe(false);
      // The QR is part of the one corner panel.
      expect(jc.x).toBeGreaterThanOrEqual(panel.x);
      expect(jc.x + jc.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
      expect(jc.y + jc.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
      await shot(tv, `${name}-${s.name}`);
    }
  }

  present({ page: 'lobby' });
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  ws.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});

test('team lobby with a room code: teams in the content panel, room code in the join panel and the compact corner panel', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const colors = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
  const names = ['Gwen Page', 'Jules Pryor', 'Kay Quigg', 'Lou Yang', 'Mo Jagger', 'Nell Gray', 'Ola Pegg'];
  const ids: string[] = [];
  for (let i = 0; i < names.length; i++) ids.push(await mkProfile(api, H, { name: names[i], color: colors[i], avatar: 'owl', pin: '1357' }));
  await api.post('/api/lobby', { headers: H, data: { name: 'Team night' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const board = boards.find((b) => b.title === 'Starter Trivia Night')!;
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'team' } });
  const h = await hostSocket(host);
  const g0 = await h.until((g) => !!g);
  await h.act({ type: 'addTeam', name: 'Jumping Pygmies', color: '#dc2626', buzzerMode: 'individual', memberIds: ids.slice(0, 3) });
  await h.act({ type: 'addTeam', name: 'Quiz Wizards', color: '#2563eb', buzzerMode: 'shared', memberIds: ids.slice(3, 5) });
  await h.act({ type: 'addTeam', name: 'Gray Eagles', color: '#059669', buzzerMode: 'individual', memberIds: ids.slice(5, 7) });
  await h.act({ type: 'updateRules', rules: { ...g0.rules, requireRoomCode: true } });
  const g = await h.until((x) => x.rules.requireRoomCode && !!x.roomCode);
  h.close();

  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  ws.send(JSON.stringify({ t: 'hello', role: 'host', token: host }));
  const present = (req: Record<string, unknown>) => ws.send(JSON.stringify({ t: 'present', req }));

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await expect(tv.getByTestId('tv-lobby-full')).toContainText('Gray Eagles');
  await expect(tv.getByTestId('tv-room-code')).toContainText(g.roomCode);
  for (const s of SIZES) {
    await tv.setViewportSize(s);
    await tv.waitForTimeout(900);
    await noOverflow(tv);
    expect(await fits(tv, '.tvp-side-in')).toBe(true);
    expect(await fits(tv, '.tvp-rules-sec')).toBe(true);
    await shot(tv, `team-lobby-${s.name}`);
  }
  present({ page: 'buzzers' });
  await expect(tv.getByTestId('tv-compact-teams')).toBeVisible();
  await expect(tv.getByTestId('tv-lobby-compact').getByTestId('tv-room-code')).toContainText(g.roomCode);
  for (const s of SIZES) {
    await tv.setViewportSize(s);
    await tv.waitForTimeout(900);
    await noOverflow(tv);
    const panel = await box(tv, '[data-testid=tv-lobby-compact]');
    expect(await fits(tv, '.tvp-compact-inner')).toBe(true);
    const content = await box(tv, '[data-testid=tv-present-page] .tvp-panel');
    expect(overlaps(panel, content)).toBe(false);
    await shot(tv, `team-buzzers-${s.name}`);
  }
  present({ page: 'lobby' });
  await expect(tv.getByTestId('tv-lobby-full')).toBeVisible();
  ws.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
