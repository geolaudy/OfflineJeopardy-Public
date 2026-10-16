// Media clues (R2-12…R2-16): media-first layout with captions, answer-side media reveal,
// host-controlled audio played on the TV, automatic buzzer unlock (media-only clue; after media).
import { test, expect, chromium, request, type Browser } from '@playwright/test';
import sharp from 'sharp';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 3210}`;
let cr: Browser;
test.beforeAll(async () => {
  // The Electron TV window allows autoplay; mirror that for the test TV.
  cr = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
});
test.afterEach(async () => {
  for (const c of cr?.contexts() ?? []) await c.close();
});
test.afterAll(async () => {
  await cr?.close();
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

test('media-first clue with caption, answer image reveal, host-controlled audio and automatic unlock', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  await api.post('/api/games/close', { headers: H });
  const up = async (name: string, mimeType: string, buffer: Buffer) => (await (await api.post('/api/media', { headers: H, multipart: { file: { name, mimeType, buffer } } })).json()) as { url: string; kind: string };
  const covered = await up('covered.png', 'image/png', await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#334155' } }).png().toBuffer());
  const uncovered = await up('uncovered.png', 'image/png', await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#f59e0b' } }).png().toBuffer());
  const sound = await up('tone.wav', 'audio/wav', wav(2));
  expect(sound.kind).toBe('audio');

  const content = structuredClone(SAMPLE_BOARD);
  const hist = content.rounds[0].categories[0];
  hist.clues[0] = { ...hist.clues[0], question: '', answer: 'A golden sunset', media: [{ kind: 'image', url: covered.url, caption: 'Hint: it happens every evening' }], answerMedia: [{ kind: 'image', url: uncovered.url, caption: 'Uncovered!' }] };
  hist.clues[1] = { ...hist.clues[1], question: 'Name the musical note you hear.', answer: 'A (440 Hz)', media: [{ kind: 'audio', url: sound.url }], unlock: 'mediaEnd' };
  const board = await (await api.post('/api/boards', { headers: H, data: { title: 'Media Test Board', description: '', tags: [], content } })).json();
  await api.post('/api/games', { headers: H, data: { boardId: board.id, mode: 'solo' } });
  const p = await (await api.post('/api/profiles', { data: { name: 'Media Mo', color: '#1d4ed8', avatar: 'owl', pin: '1212' } })).json();

  const tv = await (await cr.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/board`);
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host`);
  await pc.getByRole('button', { name: '+ Add player' }).click();
  await pc.getByRole('dialog').getByRole('button', { name: /Media Mo/ }).click();
  await pc.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await pc.getByRole('button', { name: 'Game menu' }).click();
  await pc.getByRole('button', { name: /Rules & timers/ }).click();
  await pc.getByRole('dialog').getByLabel('Automatic buzzer unlock').selectOption('mediaOnly');
  await pc.getByRole('dialog').getByRole('button', { name: 'Save rules' }).click();
  await pc.getByTestId('start-game').click();
  await pc.getByTestId('intro-skip').click();
  expect(p.profile.id).toBeTruthy();

  // 1) Media-only clue: large image + caption, buzzers open by themselves.
  await pc.getByRole('button', { name: 'History for 200' }).click();
  const img = tv.getByTestId('clue-image');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', covered.url);
  await expect(tv.getByTestId('clue-caption')).toHaveText('Hint: it happens every evening');
  await expect(tv.getByText('Buzzers open')).toBeVisible(); // automatic unlock, no host tap
  await expect.poll(async () => (await img.boundingBox())?.height ?? 0).toBeGreaterThan(1080 * 0.45); // uses most of the screen
  await tv.waitForTimeout(1200); // let the zoom and content fade finish
  await tv.screenshot({ path: 'test-results/screens/tv-media-clue.png' });
  // Reveal: the uncovered image replaces the covered one; the answer replaces the hint.
  if (!(await pc.getByTestId('reveal-answer').isVisible())) await pc.getByTestId('clue-more').click(); // R5-14: in More while the buzz timer runs
  await pc.getByTestId('reveal-answer').click();
  await expect(tv.getByTestId('answer-side').getByTestId('clue-image')).toHaveAttribute('src', uncovered.url);
  await expect(tv.getByTestId('answer-side').getByTestId('clue-caption')).toHaveText('Uncovered!');
  await expect(tv.getByTestId('clue-answer')).toHaveText('A golden sunset');
  await expect(tv.getByTestId('clue-side')).toHaveCount(0);
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: 'test-results/screens/tv-media-answer.png' });
  await pc.getByTestId('back-to-board').click();

  // 2) Audio clue unlocking when the sound finishes; the host controls playback on the TV.
  await pc.getByRole('button', { name: 'History for 400' }).click();
  await expect(tv.getByTestId('clue-text')).toContainText('musical note', { ignoreCase: true });
  await expect(pc.getByText('Buzzers open automatically when the media finishes.')).toBeVisible();
  await expect(pc.getByTestId('media-time')).toContainText('0:02'); // duration read from metadata
  await expect(tv.getByText('Buzzers open')).toHaveCount(0);
  await pc.getByTestId('media-play').click();
  await expect(tv.getByTestId('clue-audio')).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => tv.locator('audio').evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true);
  await pc.getByTestId('media-pause').click();
  await expect(tv.getByTestId('clue-audio')).toHaveAttribute('data-playing', 'false');
  expect(await tv.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await pc.getByTestId('media-play').click(); // resume
  await expect(tv.getByText('Buzzers open')).toBeVisible({ timeout: 6000 }); // opened when the sound ended
  await expect(pc.getByText('Finished.')).toBeVisible();
  if (!(await pc.getByTestId('reveal-answer').isVisible())) await pc.getByTestId('clue-more').click(); // R5-14: in More while the buzz timer runs
  await pc.getByTestId('reveal-answer').click();
  await pc.getByTestId('back-to-board').click();
  await expect(tv.locator('audio')).toHaveCount(0); // nothing left playing after the clue closes

  // R4-10: in the editor the image-only clue is complete ("Image clue"), not "Needs question".
  await pc.goto(`${BASE}/host/boards/${board.id}`);
  const tile = pc.getByRole('button', { name: /^Edit History 200/ });
  await expect(tile).toContainText('Image clue');
  await expect(tile).not.toHaveAccessibleName(/unfinished/);

  await api.post('/api/games/close', { headers: H });
  await api.dispose();
});

test('board editor: separate image / audio / video pickers with matching file filters (R3-1)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  const board = await (await api.post('/api/boards', { headers: H, data: { title: 'Picker Board', description: '', tags: [], content: structuredClone(SAMPLE_BOARD) } })).json();
  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await pc.goto(`${BASE}/host/boards/${board.id}`);
  await pc.getByRole('button', { name: /^Edit History 200/ }).click();
  const clue = pc.getByTestId('clue-media');
  await expect(clue.getByRole('button', { name: 'Add image' })).toBeVisible();
  await expect(clue.getByRole('button', { name: 'Add audio' })).toBeVisible();
  await expect(clue.getByRole('button', { name: 'Add video' })).toBeVisible();
  const audioAccept = (await clue.getByTestId('clue-media-audio-input').getAttribute('accept'))!;
  expect(audioAccept).toContain('.mp3');
  expect(audioAccept).toContain('.wav');
  expect(audioAccept).not.toMatch(/image|\.png/);
  expect(await clue.getByTestId('clue-media-image-input').getAttribute('accept')).not.toMatch(/audio|video/);
  expect(await clue.getByTestId('clue-media-video-input').getAttribute('accept')).toContain('.mp4');
  // Choosing a sound through the Audio button adds an audio player to the clue.
  await clue.getByTestId('clue-media-audio-input').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(1) });
  await expect(clue.locator('audio')).toHaveCount(1);
  // A picture sent through the Audio button is refused with a clear message.
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#000' } }).png().toBuffer();
  await clue.getByTestId('clue-media-audio-input').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: png });
  await expect(pc.getByText(/Supported audio: MP3/)).toBeVisible();
  await expect(clue.locator('img')).toHaveCount(0);
  await clue.screenshot({ path: 'test-results/screens/editor-media-pickers.png' });
  await api.delete(`/api/boards/${board.id}`, { headers: H });
  await api.dispose();
});
