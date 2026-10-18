// Round 7 Milestone D on the iPad (WebKit): the score editor (R7-22) — − / + by the round's lowest
// value, a typed score, the change in green, Save; "Latest score changes" with take-back; Remove
// Player only with confirmation and only for someone without points.
import { test, expect, webkit, devices, request, type APIRequestContext, type Browser } from '@playwright/test';
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
  const band = ipad.getByTestId('host-clue').getByTestId('answer-banner');
  await expect(band).toHaveAttribute('data-variant', 'band');
  await expect(band).toContainText('Correct response');
  await expect(band.getByTestId('host-answer')).not.toBeEmpty();
  const [bandBox, clueBox] = [(await band.boundingBox())!, (await ipad.getByTestId('host-clue').boundingBox())!];
  expect(Math.abs(bandBox.y - clueBox.y)).toBeLessThanOrEqual(1); // at the very top of the clue card
  expect(Math.abs(bandBox.width - clueBox.width)).toBeLessThanOrEqual(1);

  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.dispose();
});
