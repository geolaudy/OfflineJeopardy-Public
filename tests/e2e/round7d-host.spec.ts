// Round 7 Milestone D on the iPad (WebKit): the score editor (R7-22) — − / + by the round's lowest
// value, a typed score, the change in green, Save; "Latest score changes" with take-back; Remove
// Player only with confirmation and only for someone without points.
import { test, expect, webkit, devices, request, type APIRequestContext, type Browser } from '@playwright/test';
import WebSocket from 'ws';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let wk: Browser;
test.beforeAll(async () => {
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const c of wk?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await wk?.close();
});

async function mkProfile(api: APIRequestContext, H: Record<string, string>, name: string, color: string): Promise<string> {
  const r = await api.post('/api/admin/profiles', { headers: H, data: { name, color, avatar: 'owl', pin: '1357' } });
  expect(r.ok()).toBe(true);
  return (await r.json()).id;
}

test('iPad game preview: one size and position in every state, controls in the reserved bar (R7-21, R7-25)', async () => {
  test.setTimeout(120_000);
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const ids = [await mkProfile(api, H, 'Pia Frame', '#dc2626'), await mkProfile(api, H, 'Quin Frame', '#2563eb'), await mkProfile(api, H, 'Rex Frame', '#059669')];
  await api.post('/api/lobby', { headers: H, data: { name: 'Frame night' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'team' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const c of (await h.until((g) => g.competitors.length > 0)).competitors) await h.act({ type: 'removeCompetitor', competitorId: c.id });
  await h.act({ type: 'addTeam', name: 'Owls', color: '#2563eb', buzzerMode: 'individual', memberIds: ids.slice(0, 2) });
  await h.act({ type: 'addTeam', name: 'Foxes', color: '#dc2626', buzzerMode: 'individual', memberIds: ids.slice(2) });
  await h.act({ type: 'startGame' });
  // Pia's phone, to buzz in for her team.
  const login = await api.post(`/api/profiles/${ids[0]}/login`, { data: { pin: '1357' } });
  const phone = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  await new Promise((res, rej) => (phone.once('open', res), phone.once('error', rej)));
  phone.send(JSON.stringify({ t: 'hello', role: 'player', token: (await login.json()).token }));

  const sizes = [
    { name: 'landscape', ...devices['iPad Pro 11 landscape'].viewport },
    { name: 'portrait', ...devices['iPad Pro 11'].viewport },
  ];
  for (const s of sizes) {
    const ctx = await wk.newContext({ ...devices['iPad Pro 11'], viewport: { width: s.width, height: s.height } });
    const ipad = await ctx.newPage();
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const measure = async (state: string, testId: string) => {
      await expect(ipad.getByTestId(testId)).toBeVisible();
      await ipad.waitForTimeout(250);
      boxes[state] = (await ipad.getByTestId(testId).boundingBox())!;
      // The bar's content fits its reserved height (nothing scrolls away).
      expect(await ipad.getByTestId('game-bar').evaluate((e) => e.scrollHeight <= e.clientHeight + 1), `${s.name} ${state}: bar overflows`).toBe(true);
      await ipad.screenshot({ path: `test-results/screens/r7d-frame-${s.name}-${state}.png` });
    };
    if (s.name === 'landscape') {
      await ipad.goto(`${BASE}/host`);
      await measure('intro', 'intro-preview-box');
      await h.act({ type: 'introSkip' });
    } else await ipad.goto(`${BASE}/host`);
    await measure('board', 'host-board-box');
    let g = await h.until((x) => x.phase === 'board' && !x.intro);
    const clue = g.rounds[0].categories[s.name === 'landscape' ? 0 : 1].clues[0];
    await h.act({ type: 'selectClue', clueId: clue.id });
    await measure('clue', 'clue-preview-box');
    await expect(ipad.getByTestId('clue-preview')).toHaveAttribute('data-ready', 'true');
    await h.act({ type: 'unlockBuzzers' });
    phone.send(JSON.stringify({ t: 'buzz' }));
    await expect(ipad.getByTestId('host-winner')).toHaveText('Owls');
    await measure('buzzed', 'clue-preview-box');
    await ipad.getByTestId('correct').click();
    await expect(ipad.getByTestId('back-to-board')).toBeVisible();
    await measure('judged', 'clue-preview-box');
    await ipad.getByTestId('back-to-board').click();
    g = await h.until((x) => x.phase === 'board');
    if (s.name === 'landscape') {
      // Daily Double!: the wager form is a compact panel inside the preview (with the clue for the host).
      const dd = g.rounds[0].categories.flatMap((c: { clues: { id: string; dailyWager?: boolean; used: boolean }[] }) => c.clues).find((q: { dailyWager?: boolean; used: boolean }) => q.dailyWager && !q.used);
      if (dd) {
        await h.act({ type: 'selectClue', clueId: dd.id });
        await expect(ipad.getByTestId('clue-overlay')).toBeVisible();
        await expect(ipad.getByTestId('host-dd-clue')).toBeVisible();
        await measure('daily-double', 'clue-preview-box');
        const [ov, pv] = [(await ipad.getByTestId('clue-overlay').boundingBox())!, (await ipad.getByTestId('clue-preview-box').boundingBox())!];
        expect(ov.y + ov.height).toBeLessThanOrEqual(pv.y + pv.height + 1); // inside the preview
        await h.act({ type: 'closeClue', clueId: dd.id });
        await h.until((x) => x.phase === 'board');
      }
    }
    const ref = boxes.board;
    const stage = (await ipad.getByTestId('game-stage').boundingBox())!;
    expect(Math.abs(stage.width / stage.height - 16 / 9 / 0.86)).toBeLessThan(0.02); // R11-3
    for (const [state, b] of Object.entries(boxes)) {
      for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(b[k] - ref[k]), `${s.name} ${state} ${k}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
  phone.close();
  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});

test('iPad score editor: step, type, save, take back, remove player (R7-22)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const ids = [await mkProfile(api, H, 'Ann Editor', '#dc2626'), await mkProfile(api, H, 'Ben Editor', '#2563eb'), await mkProfile(api, H, 'Cy Editor', '#059669')];
  await api.post('/api/lobby', { headers: H, data: { name: 'Score editor' } });
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  await api.post('/api/games', { headers: H, data: { boardId: boards.find((b) => b.title === 'Starter Trivia Night')!.id, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const id of ids) await h.act({ type: 'addPlayer', profileId: id });
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  let g = await h.until((x) => x.phase === 'board' && !x.intro);
  const ann = g.competitors.find((c: { profileId: string }) => c.profileId === ids[0]).id as string;
  await h.act({ type: 'adjustScore', competitorId: ann, delta: 400, note: 'manual' });
  const scoreOf = async (cid: string, want: number) => (await h.until((x) => x.competitors.find((c: { id: string }) => c.id === cid)?.score === want)).competitors.find((c: { id: string }) => c.id === cid).score;

  const ctx = await wk.newContext({ ...devices['iPad Pro 11 landscape'] });
  const ipad = await ctx.newPage();
  await ipad.goto(`${BASE}/host`);
  await expect(ipad.getByTestId('host-score')).toHaveCount(3);
  await ipad.getByRole('button', { name: 'Adjust score for Ann Editor' }).click();
  const ed = ipad.getByTestId('score-editor');
  await expect(ed).toBeVisible();
  await expect(ed.getByTestId('score-input')).toHaveValue('400');
  await expect(ed.getByTestId('score-change')).toHaveText('No change');
  await expect(ed.getByTestId('score-save')).toBeDisabled();
  // − / + step by the round's lowest clue value; nothing is saved yet.
  const step = Number((await ed.getByTestId('score-plus').getAttribute('aria-label'))!.replace(/\D/g, ''));
  expect(step).toBeGreaterThan(0);
  await ed.getByTestId('score-plus').click();
  await ed.getByTestId('score-plus').click();
  await expect(ed.getByTestId('score-input')).toHaveValue(String(400 + 2 * step));
  await expect(ed.getByTestId('score-change')).toHaveClass(/text-green-700/);
  await ed.getByTestId('score-minus').click();
  await expect(ed.getByTestId('score-input')).toHaveValue(String(400 + step));
  expect(await scoreOf(ann, 400)).toBe(400);
  // A typed score; the change is shown, then saved.
  await ed.getByTestId('score-input').fill('1000');
  await expect(ed.getByTestId('score-change')).toContainText('600');
  await ipad.screenshot({ path: 'test-results/screens/r7d-score-editor.png' });
  await ed.getByTestId('score-save').click();
  await expect(ed).toBeHidden();
  expect(await scoreOf(ann, 1000)).toBe(1000);

  // Latest score changes: newest first; taking one back changes the score right away.
  await ipad.getByRole('button', { name: 'Adjust score for Ann Editor' }).click();
  await expect(ed.getByTestId('score-change-row')).toHaveCount(2);
  await expect(ed.getByTestId('score-change-row').first()).toContainText('Host awarded $600 to Ann Editor');
  await expect(ed.getByTestId('remove-player')).toBeDisabled(); // she has points
  await ed.getByTestId('score-change-remove').first().click();
  expect(await scoreOf(ann, 400)).toBe(400);
  await expect(ed.getByTestId('score-change-row')).toHaveCount(1);
  await ipad.screenshot({ path: 'test-results/screens/r7d-score-changes.png' });
  await ed.getByTestId('score-cancel').click();
  await expect(ed).toBeHidden();

  // Remove Player asks first; Keep does nothing, Remove removes.
  await ipad.getByRole('button', { name: 'Adjust score for Cy Editor' }).click();
  await ed.getByTestId('remove-player').click();
  await expect(ed.getByTestId('remove-confirm')).toContainText('Remove Cy Editor from this game?');
  await ed.getByRole('button', { name: 'Keep' }).click();
  await expect(ed.getByTestId('remove-confirm')).toBeHidden();
  await ed.getByTestId('remove-player').click();
  await ed.getByTestId('remove-yes').click();
  await expect(ipad.getByTestId('host-score')).toHaveCount(2);

  // Undo brings the taken-back change back.
  g = await h.until((x) => x.competitors.length === 2);
  await h.act({ type: 'undo' }); // the removal is not undoable (it is not a scoring step), so this undoes the take-back
  expect(await scoreOf(ann, 1000)).toBe(1000);

  // Portrait: the editor fits the screen.
  await ipad.setViewportSize({ width: 834, height: 1112 });
  await ipad.getByRole('button', { name: 'Adjust score for Ann Editor' }).click();
  const box = (await ed.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(1112 + 1);
  await ipad.screenshot({ path: 'test-results/screens/r7d-score-editor-portrait.png' });
  await ed.getByTestId('score-cancel').click();

  // R7-24: the private answer is a striped band across the top of the clue card, host only.
  g = await h.until((x) => x.phase === 'board');
  await h.act({ type: 'selectClue', clueId: g.rounds[0].categories[0].clues[0].id });
  // R11-3.3: the band is the frame's top strip, right above the TV area, as wide as the frame.
  const band = ipad.getByTestId('game-strip').getByTestId('answer-banner');
  await expect(band).toHaveAttribute('data-variant', 'band');
  await expect(band).toContainText('Correct response');
  await expect(band.getByTestId('host-answer')).not.toBeEmpty();
  const [bandBox, frameBox, stageBox] = [(await band.boundingBox())!, (await ipad.getByTestId('clue-preview-box').boundingBox())!, (await ipad.getByTestId('game-stage').boundingBox())!];
  expect(Math.abs(bandBox.y - frameBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(bandBox.width - frameBox.width)).toBeLessThanOrEqual(1);
  expect(bandBox.y + bandBox.height).toBeLessThanOrEqual(stageBox.y + 1);

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
