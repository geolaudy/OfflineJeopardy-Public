// Round 11 — milestone A:
// - a Buzzinga picture clue's text is imported as the clue text (editor + TV), not a caption (R11-2);
// - one "buzzers open" glow on the TV and the iPad preview — no second line above the timer (R11-6);
// - no "buzzed in" card on the iPad preview (the TV keeps it) (R11-5);
// - the host's timer is a line along the top of the control band; the controls are centred (R11-3.7, R11-4).
import { test, expect, chromium, webkit, devices, request, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { BoardContent } from '../../src/shared/game';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r11-${name}.png` });
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
  await wk?.close();
});

async function setup() {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  return { api, host, H };
}

/** A two-player solo game on `boardId`, at the board. */
async function startGame(api: Awaited<ReturnType<typeof setup>>['api'], host: string, H: Record<string, string>, boardId: string, tag: string) {
  await api.post('/api/lobby', { headers: H, data: { name: 'Round 11 night' } });
  await api.post('/api/games', { headers: H, data: { boardId, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  for (const [i, name] of ['Eleven Ann', 'Eleven Bo'].entries()) {
    const p = (await (await api.post('/api/profiles', { data: { name: `${name} ${tag}`, color: i ? '#2563eb' : '#dc2626', avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
  }
  const g = await h.until((x) => x.competitors.length === 2);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  return { h, ids: g.competitors.map((c: { id: string }) => c.id) as string[] };
}

test('Buzzinga picture clue: its text is the clue text in the editor and on the TV, not a caption (R11-2)', async () => {
  test.setTimeout(120_000);
  const { api, host, H } = await setup();
  const doc = {
    name: 'Buzzinga Pictures R11',
    rounds: [
      [
        {
          category: 'Planets',
          clues: [
            { text: 'saturn picture.png', answer: 'Saturn', type: 'IMAGE', answerType: 'TEXT', bottomCaption: 'Name this ringed planet' },
            { text: 'The red planet', answer: 'Mars', type: 'TEXT', answerType: 'TEXT' },
          ],
        },
      ],
    ],
  };
  const ins = await (await api.post('/api/import/inspect', { headers: H, data: { kind: 'file', name: 'pictures.json', text: JSON.stringify(doc) } })).json();
  expect(ins.source.id).toBe('buzzinga');
  const com = await (await api.post('/api/import/commit', { headers: H, data: { importId: ins.importId } })).json();
  const boardId = com.boardId as string;
  // (The picture reference is not downloadable — the test server is offline — so put a local one in.)
  const pic = (await (await api.post('/api/media', { headers: H, multipart: { file: { name: 'saturn.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#a16207' } }).png().toBuffer() } } })).json()) as { url: string };
  const rec = await (await api.get(`/api/boards/${boardId}`, { headers: H })).json();
  const content = rec.content as BoardContent;
  const clue = content.rounds[0].categories[0].clues[0];
  expect(clue.question).toBe('Name this ringed planet');
  expect((clue.media ?? []).some((m) => m.caption)).toBe(false);
  clue.media = [{ kind: 'image', url: pic.url }];
  await api.put(`/api/boards/${boardId}`, { headers: H, data: { title: rec.title, description: rec.description ?? '', tags: rec.tags ?? [], content } });

  // Reopened in the editor: the text is in the clue text field; the caption field is empty.
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/boards/${boardId}`);
  await pc.getByRole('button', { name: /^Edit Planets 200/ }).click();
  await expect(pc.getByTestId('clue-question')).toHaveAttribute('data-value', 'Name this ringed planet');
  await expect(pc.getByTestId('clue-question')).toHaveText('Name this ringed planet');
  await expect(pc.getByTestId('clue-media').getByPlaceholder(/Caption/)).toHaveValue('');
  await shot(pc, 'buzzinga-editor');

  // Gameplay: the picture with the text under it, as a clue made by hand.
  const { h } = await startGame(api, host, H, boardId, 'imp');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'selectClue', clueId: clue.id });
  await expect(tv.getByTestId('clue-text')).toHaveText('Name this ringed planet');
  await expect(tv.getByTestId('clue-image')).toHaveAttribute('src', pic.url);
  await expect(tv.getByTestId('clue-caption')).toHaveCount(0);
  await tv.waitForTimeout(800);
  await shot(tv, 'buzzinga-tv');
  h.close();
});

test('one buzzers-open glow; no buzzed-in card on the iPad preview; host timer line in the centred control band (R11-3.7, R11-4, R11-5, R11-6)', async () => {
  test.setTimeout(150_000);
  const { api, host, H } = await setup();
  const boards = (await (await api.get('/api/boards', { headers: H })).json()) as { id: string; title: string }[];
  const { h, ids } = await startGame(api, host, H, boards.find((b) => b.title === 'Starter Trivia Night')!.id, 'glow');
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ipad = await (await wk.newContext({ ...devices['iPad Pro 11 landscape'] })).newPage();
  await ipad.goto(`${BASE}/host`);
  await h.act({ type: 'selectClue', clueId: 'hist_3' });
  await expect(ipad.getByTestId('clue-preview-box')).toBeVisible();
  // Centred controls: the bar's content is centred in the band.
  const centred = async () => {
    const band = (await ipad.getByTestId('game-bar').boundingBox())!;
    const inner = (await ipad.getByTestId('clue-footer').boundingBox())!;
    return Math.abs(inner.y + inner.height / 2 - (band.y + band.height / 2));
  };
  expect(await centred()).toBeLessThan(3);
  await ipad.getByTestId('unlock').click();
  await h.act({ type: 'timerStart', kind: 'buzz', seconds: 30 });
  // One glow on the TV: the bottom line glows, the 7vh box around it does not.
  const ind = tv.locator('.bt-ind-bottom');
  await expect(ind).toHaveCount(1);
  expect(await ind.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
  expect(await ind.evaluate((e) => getComputedStyle(e, '::after').boxShadow)).not.toBe('none');
  // The host's timer line: in the band, along its top edge; the preview has no TV timer bar.
  await expect(ipad.getByTestId('host-timer-line')).toBeVisible();
  const line = (await ipad.getByTestId('host-timer-line').boundingBox())!;
  const band = (await ipad.getByTestId('game-bar').boundingBox())!;
  expect(Math.abs(line.y - band.y)).toBeLessThan(2);
  expect(line.width).toBeGreaterThan(band.width - 2);
  const frame = ipad.frameLocator('[data-testid="clue-preview"] iframe');
  await expect(frame.getByTestId('tv-timer')).toBeHidden();
  await expect(tv.getByTestId('tv-timer')).toBeVisible();
  expect(await centred()).toBeLessThan(3);
  const box0 = (await ipad.getByTestId('clue-preview-box').boundingBox())!;
  await tv.waitForTimeout(1500);
  await shot(tv, 'tv-buzzers-open');
  await shot(ipad, 'ipad-buzzers-open');

  // A buzz: the TV shows the buzzed-in card and the podium glow; the iPad preview shows no card.
  await h.act({ type: 'hostBuzz', competitorId: ids[0] });
  await expect(tv.getByTestId('buzz-winner')).toBeVisible();
  await expect(tv.locator('.bt-podium.is-winner')).toHaveCount(1);
  await expect(tv.getByTestId('tv-unlock-indicator')).toHaveCount(0);
  await expect(frame.getByTestId('buzz-winner')).toHaveCount(1);
  await expect(frame.getByTestId('buzz-winner')).toBeHidden();
  await expect(ipad.getByTestId('host-winner')).toBeVisible(); // who buzzed: on the band
  expect(await centred()).toBeLessThan(3);
  expect((await ipad.getByTestId('clue-preview-box').boundingBox())!).toEqual(box0);
  await tv.waitForTimeout(800);
  await shot(tv, 'tv-buzzed');
  await shot(ipad, 'ipad-buzzed');
  // Wrong → buzzers open again → the second player buzzes: still one glow at a time.
  await ipad.getByTestId('incorrect').click();
  await h.until((g) => g.buzzer.status !== 'buzzed');
  if ((await h.until(() => true)).buzzer.status === 'locked') await ipad.getByTestId('unlock').click();
  await h.act({ type: 'hostBuzz', competitorId: ids[1] });
  await expect(tv.locator('.bt-podium.is-winner')).toHaveCount(1);
  await expect(tv.getByTestId('tv-unlock-indicator')).toHaveCount(0);
  h.close();
});
