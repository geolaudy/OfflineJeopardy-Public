// Round 17 C — Settings in tabs (R17-14) and the game data location (R17-15).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r17-${name}.png` });
let wk: Browser;
let cr: Browser;
test.beforeAll(async () => {
  wk = await webkit.launch();
  cr = await chromium.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await wk?.close();
  await cr?.close();
});

async function setup() {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  return { api, host, H };
}
async function openLobby() {
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/lobby', { headers: H, data: { name: 'Settings night' } });
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  return { api, host, H, h };
}

const TABS = ['gameplay', 'players', 'display', 'sound', 'network', 'data', 'advanced'] as const;

test('every settings tab fits an iPad in landscape without scrolling; tabs work by touch and arrow keys (R17-14)', async () => {
  test.setTimeout(120_000);
  const { h } = await openLobby();
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host/settings`);
  await expect(ipad.getByTestId('settings-tab-gameplay')).toHaveAttribute('aria-selected', 'true');
  for (const t of TABS) {
    await ipad.getByTestId(`settings-tab-${t}`).click();
    await expect(ipad.getByTestId(`settings-panel-${t}`)).toBeVisible();
    await ipad.waitForTimeout(250);
    const m = await ipad.getByTestId('host-main').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    await shot(ipad, `settings-${t}`);
    expect(m.sh, `${t}: no scrolling`).toBeLessThanOrEqual(m.ch + 1);
    if (t === 'sound') {
      await ipad.getByTestId('sound-view-soundCues').click();
      await ipad.waitForTimeout(200);
      const c = await ipad.getByTestId('host-main').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
      await shot(ipad, 'settings-sound-cues');
      expect(c.sh, 'each sound: no scrolling').toBeLessThanOrEqual(c.ch + 1);
    }
  }
  // Keyboard: arrows move between tabs.
  await ipad.getByTestId('settings-tab-advanced').focus();
  await ipad.keyboard.press('ArrowLeft');
  await expect(ipad.getByTestId('settings-tab-data')).toHaveAttribute('aria-selected', 'true');
  await expect(ipad).toHaveURL(/tab=data/);
  h.close();
});

test('Gameplay tab edits the lobby rules, including the Daily Double! wager entry (R17-2, R17-14)', async () => {
  const { h } = await openLobby();
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/settings`);
  await expect(pc.getByTestId('rule-dd-entry')).toHaveValue('host');
  await pc.getByTestId('rule-dd-entry').selectOption('player');
  await pc.getByLabel('Answer time').fill('12');
  await pc.getByTestId('settings-rules-save').click();
  const g = await h.until((x) => x.rules.dailyWagerEntry === 'player');
  expect(g.rules.timers.answerSeconds).toBe(12);
  // The dialog shows the same rules in tabs.
  await pc.goto(`${BASE}/host`);
  await pc.getByRole('button', { name: 'Game menu' }).click();
  await pc.getByRole('button', { name: /Rules & timers/ }).click();
  const dialog = pc.getByRole('dialog', { name: 'Rules & timers' });
  await dialog.getByTestId('rules-tab-clues').click();
  await expect(dialog.getByTestId('rule-dd-entry')).toHaveValue('player');
  h.close();
});

test('Data & Storage: the folder, a typed new location is checked, the move is requested and can be cancelled (R17-15)', async () => {
  await setup();
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/settings?tab=data`);
  await expect(pc.getByTestId('data-dir')).toContainText('e2e-data');
  await expect(pc.getByTestId('data-open')).toBeDisabled(); // File Explorer: the Windows app only
  await pc.getByTestId('data-change').click(); // no folder picker here → a path field
  const dest = path.join(os.tmpdir(), `oj-e2e-move-${Date.now()}`, 'Quiz Abend ü');
  await pc.getByTestId('data-path').fill(dest);
  await pc.getByTestId('data-check').click();
  await expect(pc.getByTestId('data-check-result')).toContainText(dest);
  await pc.getByTestId('data-move').click();
  await expect(pc.getByTestId('data-pending')).toContainText(dest);
  await expect(pc.getByTestId('data-pending')).toContainText('Restart OfflineJeopardy on the game computer');
  await shot(pc, 'data-pending');
  expect(fs.existsSync(dest)).toBe(false); // nothing is copied before the restart
  await pc.getByTestId('data-cancel').click();
  await expect(pc.getByTestId('data-pending')).toHaveCount(0);
  // A folder inside the data folder is refused with a clear message.
  await pc.getByTestId('data-change').click();
  const data = (await pc.getByTestId('data-dir').textContent())!;
  await pc.getByTestId('data-path').fill(path.join(data, 'inside'));
  await pc.getByTestId('data-check').click();
  await expect(pc.getByTestId('data-check-result')).toContainText(/inside the current data folder/);
});
