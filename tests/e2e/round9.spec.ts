// Round 9 — Final Jeopardy! pictures and sounds (R9-6) and the iPad Final in the game frame (R9-5):
// - the board editor saves, reloads and removes Final clue / correct-response media;
// - the TV shows the clue's picture with the clue and plays its sound under the host's control; the
//   think time starts when the sound ends; nothing plays on the iPad; cleanup when the reveals start;
// - the correct response's picture and sound stay off the TV until the correct response is shown;
// - the iPad Final keeps the game preview's size and position in every stage.
import { test, expect, chromium, webkit, devices, request, type Browser, type Page, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { hostSocket } from './hostSocket';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/screens/r9-${name}.png` });
let cr: Browser;
let wk: Browser;
test.beforeAll(async () => {
  // The Electron TV window allows autoplay; mirror that for the test TV.
  cr = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  wk = await webkit.launch();
});
test.afterEach(async () => {
  for (const b of [cr, wk]) for (const c of b?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
  await wk?.close();
});

/** 16-bit mono PCM WAV with a quiet tone. */
function wav(seconds: number) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 800), 44 + i * 2);
  return b;
}
const png = (w: number, h: number, background: string) => sharp({ create: { width: w, height: h, channels: 3, background } }).png().toBuffer();

async function setup() {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  const up = async (name: string, mimeType: string, buffer: Buffer) => (await (await api.post('/api/media', { headers: H, multipart: { file: { name, mimeType, buffer } } })).json()) as { url: string; kind: string };
  return { api, host, H, up };
}

/** A solo game on `boardId` with two players who both have money, at the Final's category. */
async function toFinal(api: APIRequestContext, host: string, H: Record<string, string>, boardId: string, names: [string, string]) {
  await api.post('/api/lobby', { headers: H, data: { name: 'Final media night' } });
  await api.post('/api/games', { headers: H, data: { boardId, mode: 'solo' } });
  const h = await hostSocket(host);
  await h.until((g) => !!g);
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const p = (await (await api.post('/api/profiles', { data: { name, color: i ? '#2563eb' : '#dc2626', avatar: 'fox', pin: '2468' } })).json()) as { profile: { id: string } };
    await h.act({ type: 'addPlayer', profileId: p.profile.id });
    ids.push(p.profile.id);
  }
  const g = await h.until((x) => x.competitors.length === 2);
  const [A, B] = ids.map((pid) => g.competitors.find((c: { profileId: string }) => c.profileId === pid).id as string);
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  await h.act({ type: 'adjustScore', competitorId: A, delta: 1000 });
  await h.act({ type: 'adjustScore', competitorId: B, delta: 2000 });
  return { h, A, B };
}

test('Final Jeopardy! media: editor save + reload, TV picture and sound, correct response kept back, iPad frame (R9-5, R9-6)', async () => {
  test.setTimeout(180_000);
  const { api, host, H, up } = await setup();
  const map = await up('map.png', 'image/png', await png(1600, 900, '#334155'));
  const city = await up('city.png', 'image/png', await png(1200, 900, '#f59e0b'));
  const tone = await up('tone.wav', 'audio/wav', wav(2));
  const board = await (await api.post('/api/boards', { headers: H, data: { title: 'Final Media Board', description: '', tags: [], content: structuredClone(SAMPLE_BOARD) } })).json();
  const finalClue = async () => (await (await api.get(`/api/boards/${board.id}`, { headers: H })).json()).content.rounds.find((r: { kind: string }) => r.kind === 'final').categories[0].clues[0];

  // 1) Board editor: add a picture and a sound to the clue and to the correct response (autosaved).
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/boards/${board.id}`);
  await pc.getByRole('tab', { name: /Final/ }).click();
  await pc.getByTestId('clue-question').fill('Name this city.');
  await pc.getByTestId('clue-media-image-input').setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: await png(1600, 900, '#334155') });
  await expect(pc.getByTestId('clue-media').locator('img')).toHaveCount(1);
  await pc.getByTestId('clue-media-audio-input').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(2) });
  await expect(pc.getByTestId('clue-media').locator('audio')).toHaveCount(1);
  // Two uploads at once both stay (they used to replace each other).
  await pc.getByTestId('answer-media-image-input').setInputFiles({ name: 'city.png', mimeType: 'image/png', buffer: await png(1200, 900, '#f59e0b') });
  await pc.getByTestId('answer-media-audio-input').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(1) });
  await expect(pc.getByTestId('answer-media').locator('audio')).toHaveCount(1);
  await expect(pc.getByTestId('answer-media').locator('img')).toHaveCount(1);
  await expect(pc.getByText('Buzzer unlock')).toHaveCount(0); // no buzzers in the Final
  await expect.poll(async () => { const q = await finalClue(); return [q.question, q.media?.map((m: { kind: string }) => m.kind), q.answerMedia?.map((m: { kind: string }) => m.kind).sort()]; }, { timeout: 8000 }).toEqual(['Name this city.', ['image', 'audio'], ['audio', 'image']]);
  // Reopen: everything is still there; then remove the correct response's sound.
  await pc.reload();
  await pc.getByRole('tab', { name: /Final/ }).click();
  await expect(pc.getByTestId('clue-media').locator('img')).toHaveCount(1);
  await expect(pc.getByTestId('clue-media').locator('audio')).toHaveCount(1);
  await expect(pc.getByTestId('answer-media').locator('img')).toHaveCount(1);
  const audioAt = (await finalClue()).answerMedia.findIndex((m: { kind: string }) => m.kind === 'audio') + 1;
  await pc.getByTestId('answer-media').getByRole('button', { name: new RegExp(`remove ${audioAt}`) }).click();
  await expect.poll(async () => (await finalClue()).answerMedia?.map((m: { kind: string }) => m.kind), { timeout: 8000 }).toEqual(['image']);
  await pc.close();

  // Play it with known media (the editor's uploads are equivalent; fixed URLs make the checks exact).
  const content = structuredClone(SAMPLE_BOARD);
  const fq = content.rounds.find((r) => r.kind === 'final')!.categories[0].clues[0];
  Object.assign(fq, { question: 'Name this city.', answer: 'Budapest', media: [{ kind: 'image', url: map.url, caption: 'From above' }, { kind: 'audio', url: tone.url }], answerMedia: [{ kind: 'image', url: city.url }, { kind: 'audio', url: tone.url }] });
  await api.put(`/api/boards/${board.id}`, { headers: H, data: { title: 'Final Media Board', description: '', tags: [], content } });
  const { h, A, B } = await toFinal(api, host, H, board.id, ['Media Ann', 'Media Bo']);

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const ctx = await wk.newContext({ ...devices['iPad Pro 11'], viewport: devices['iPad Pro 11 landscape'].viewport });
  const ipad = await ctx.newPage();
  await ipad.goto(`${BASE}/host`);
  const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
  const measure = async (state: string) => {
    await expect(ipad.getByTestId('final-preview-box')).toBeVisible();
    await ipad.waitForTimeout(250);
    boxes[state] = (await ipad.getByTestId('final-preview-box').boundingBox())!;
    expect(await ipad.getByTestId('game-bar').evaluate((e) => e.scrollHeight <= e.clientHeight + 1), `${state}: bar overflows`).toBe(true);
    await shot(ipad, `ipad-${state}`);
  };
  const tvImg = (url: string) => tv.locator(`img[src="${url}"]`);

  await expect(ipad.getByTestId('host-board-box')).toBeVisible();
  await ipad.waitForTimeout(250);
  const boardBox = (await ipad.getByTestId('host-board-box').boundingBox())!;
  await h.act({ type: 'startFinal' });

  // 2) Category: the host may read ahead (clue picture privately); the TV shows neither picture.
  await expect(ipad.getByTestId('final-control')).toBeVisible();
  await expect(ipad.getByTestId('final-host-clue')).toContainText('Name this city.');
  await expect(ipad.getByTestId('final-host-clue').locator(`img[src="${map.url}"]`)).toHaveCount(1);
  await expect(ipad.getByTestId('host-answer')).toHaveText('Budapest');
  await measure('category');
  await expect(tv.getByTestId('tv-final')).toBeVisible();
  await expect(tvImg(map.url)).toHaveCount(0);
  await expect(tvImg(city.url)).toHaveCount(0);
  // The correct response's media privately on the iPad: nothing changes on the TV.
  await ipad.getByTestId('final-answer-media').click();
  await expect(ipad.getByTestId('final-answer-sheet').locator(`img[src="${city.url}"]`)).toBeVisible();
  await expect(ipad.getByTestId('final-answer-preview-audio')).toHaveCount(1);
  await ipad.getByTestId('final-answer-sheet-close').click();
  await expect(tvImg(city.url)).toHaveCount(0);

  // 3) Wagers, then the clue: big picture + text; the sound waits for the host; no think time yet.
  await ipad.getByTestId('final-next').click();
  await h.until((x) => x.final?.stage === 'wagers');
  await h.act({ type: 'setFinalWager', competitorId: A, amount: 500 });
  await h.act({ type: 'setFinalWager', competitorId: B, amount: 100 });
  await expect(ipad.getByTestId('final-status').filter({ hasText: 'Wagered ✓' })).toHaveCount(2); // no "missing" prompt
  await measure('wagers');
  await ipad.getByTestId('final-next').click();
  const clueImg = tv.getByTestId('tv-final-clue').getByTestId('clue-image');
  await expect(clueImg).toHaveAttribute('src', map.url);
  await expect(tv.getByTestId('tv-final-clue').getByTestId('clue-text')).toHaveText('Name this city.');
  await expect(tv.getByTestId('tv-final-clue').getByTestId('clue-caption')).toHaveText('From above');

  await expect.poll(async () => (await clueImg.boundingBox())?.height ?? 0).toBeGreaterThan(1080 * 0.3);
  const ib = (await clueImg.boundingBox())!;
  expect(Math.abs(ib.width / ib.height - 16 / 9)).toBeLessThan(0.02); // aspect kept, never stretched
  await expect(tv.getByTestId('tv-final-status')).toBeVisible();
  const chips = (await tv.getByTestId('tv-final-status').boundingBox())!;
  const text = (await tv.getByTestId('tv-final-clue').getByTestId('clue-text').boundingBox())!;
  expect(text.y + text.height).toBeLessThanOrEqual(chips.y + 1); // nothing runs into the chips
  await expect(tv.getByTestId('tv-timer')).toHaveCount(0);
  await expect(ipad.getByTestId('final-start-think')).toBeVisible();
  await expect(ipad.getByTestId('final-timer')).toHaveCount(0);
  await expect(tvImg(city.url)).toHaveCount(0);
  await tv.waitForTimeout(700);
  await shot(tv, 'tv-final-picture-clue');
  await measure('clue');

  // 4) Sound: play, pause, resume on the TV only; one audio element; the iPad's preview is silent.
  await expect(ipad.getByTestId('media-time')).toContainText('0:02');
  await ipad.getByTestId('media-play').click();
  await expect(tv.getByTestId('tv-final-clue').getByTestId('clue-audio')).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => tv.locator('audio').evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true);
  await expect(tv.locator('audio')).toHaveCount(1);
  const frame = ipad.frameLocator('[data-testid="final-preview"] iframe');
  await expect(frame.locator('audio')).toHaveCount(1);
  expect(await frame.locator('audio').evaluate((a: HTMLAudioElement) => a.muted)).toBe(true);
  await ipad.getByTestId('media-pause').click();
  await expect(tv.getByTestId('tv-final-clue').getByTestId('clue-audio')).toHaveAttribute('data-playing', 'false');
  expect(await tv.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await expect(ipad.getByTestId('final-timer')).toHaveCount(0); // still no think time
  await ipad.getByTestId('media-play').click(); // resume → ends → the think time starts
  await expect(ipad.getByTestId('final-timer')).toBeVisible({ timeout: 6000 });
  await expect(tv.getByTestId('tv-timer')).toBeVisible();
  await expect(ipad.getByTestId('final-start-think')).toHaveCount(0);
  await expect(tv.locator('audio')).toHaveCount(1);

  // 5) Answers close; the reveals begin: the clue (and its sound) leave the TV.
  await h.act({ type: 'setFinalAnswer', competitorId: A, answer: 'Budapest', submit: true });
  await h.act({ type: 'setFinalAnswer', competitorId: B, answer: 'Prague', submit: true });
  await expect(ipad.getByTestId('final-status').filter({ hasText: 'Answered ✓' })).toHaveCount(2);
  await ipad.getByTestId('final-next').click();
  await expect(ipad.getByTestId('final-begin-reveal')).toBeVisible();
  await ipad.getByTestId('final-begin-reveal').click();
  await expect(tv.getByTestId('tv-final-name')).toHaveText('Media Ann');
  await expect(tv.locator('audio')).toHaveCount(0);
  await measure('reveal');
  for (const [name, correct] of [['Media Ann', true], ['Media Bo', false]] as const) {
    await expect(ipad.getByTestId('final-reveal-name')).toHaveText(name);
    await ipad.getByTestId('final-reveal-next').click(); // wager
    await ipad.getByTestId('final-reveal-next').click(); // their answer
    await expect(tv.getByTestId('tv-final-answer')).toHaveText(correct ? 'Budapest' : 'Prague');
    // A contestant's answer is never shown with the official picture.
    await expect(tvImg(city.url)).toHaveCount(0);
    await ipad.getByTestId(correct ? 'final-correct' : 'final-incorrect').click();
    await expect(ipad.getByTestId('final-reveal-result')).toBeVisible();
    await measure(`judged-${correct ? 'right' : 'wrong'}`);
    await ipad.getByTestId('final-reveal-next').click();
  }

  // 6) The correct response: its picture and text; its sound is available, never automatic.
  const correct = tv.getByTestId('tv-final-correct');
  await expect(correct.getByTestId('clue-image')).toHaveAttribute('src', city.url);
  await expect(correct.getByTestId('clue-answer')).toHaveText('Budapest');
  await expect(correct.getByTestId('clue-audio')).toHaveAttribute('data-playing', 'false');
  expect(await tv.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await measure('done');
  await ipad.getByTestId('media-play').click();
  await expect(correct.getByTestId('clue-audio')).toHaveAttribute('data-playing', 'true');
  await tv.waitForTimeout(500);
  await shot(tv, 'tv-final-picture-answer');
  const g = await h.until((x) => x.final?.stage === 'done');
  expect(Object.fromEntries(g.competitors.map((c: { id: string; score: number }) => [c.id, c.score]))).toEqual({ [A]: 1500, [B]: 1900 });
  await ipad.getByTestId('end-game').click();
  await expect(tv.locator('audio')).toHaveCount(0);

  // The preview never moved: same box as on the board, in every Final stage.
  expect(Math.abs(boardBox.width / boardBox.height - 16 / 9)).toBeLessThan(0.02);
  for (const [state, b] of Object.entries(boxes)) for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(b[k] - boardBox[k]), `${state} ${k}`).toBeLessThanOrEqual(1);
  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.delete(`/api/boards/${board.id}`, { headers: H });
  await api.dispose();
});

test('Final Jeopardy! picture-only clue and picture-only correct response (R9-6.2, 6.3)', async () => {
  test.setTimeout(120_000);
  const { api, host, H, up } = await setup();
  const pic = await up('tall.png', 'image/png', await png(600, 900, '#0f766e'));
  const ans = await up('answer.png', 'image/png', await png(900, 600, '#7c3aed'));
  const content = structuredClone(SAMPLE_BOARD);
  Object.assign(content.rounds.find((r) => r.kind === 'final')!.categories[0].clues[0], { question: '', answer: '', media: [{ kind: 'image', url: pic.url }], answerMedia: [{ kind: 'image', url: ans.url }] });
  const board = await (await api.post('/api/boards', { headers: H, data: { title: 'Picture Final', description: '', tags: [], content } })).json();
  const { h, A, B } = await toFinal(api, host, H, board.id, ['Pic Ann', 'Pic Bo']);
  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  await h.act({ type: 'startFinal' });
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'setFinalWager', competitorId: A, amount: 0 });
  await h.act({ type: 'setFinalWager', competitorId: B, amount: 0 });
  await h.act({ type: 'finalNext' });
  const img = tv.getByTestId('tv-final-clue').getByTestId('clue-image');
  await expect(img).toHaveAttribute('src', pic.url);
  await expect(tv.getByTestId('tv-final-clue').getByTestId('clue-text')).toHaveCount(0);
  // A tall picture alone gets nearly all of the clue area's height, kept upright (2:3).
  await expect.poll(async () => (await img.boundingBox())?.height ?? 0).toBeGreaterThan(1080 * 0.42);
  const b = (await img.boundingBox())!;
  expect(Math.abs(b.width / b.height - 2 / 3)).toBeLessThan(0.02);
  // The think time started at once (no sound to wait for).
  await expect(tv.getByTestId('tv-timer')).toBeVisible();
  await h.act({ type: 'finalNext' });
  await h.act({ type: 'finalNext' });
  const order = (await h.until((x) => x.final?.stage === 'reveal')).final.order as string[];
  for (const id of order) {
    await h.act({ type: 'finalReveal' });
    await h.act({ type: 'finalReveal' });
    await h.act({ type: 'judgeFinal', competitorId: id, correct: false });
    await h.act({ type: 'finalReveal' });
  }
  const correct = tv.getByTestId('tv-final-correct');
  await expect(correct.getByTestId('clue-image')).toHaveAttribute('src', ans.url);
  await expect(correct.getByTestId('clue-answer')).toHaveCount(0);
  await expect(correct).toContainText('Correct response');
  await tv.waitForTimeout(500);
  await shot(tv, 'tv-final-picture-only');
  h.close();
  await api.post('/api/games/close', { headers: H });
  await api.delete('/api/lobby', { headers: H });
  await api.delete(`/api/boards/${board.id}`, { headers: H });
  await api.dispose();
});
