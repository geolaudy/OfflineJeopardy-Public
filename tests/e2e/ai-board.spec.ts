// Create a board with AI (spec §19): without AI set up the dialog explains what to do; with a
// local OpenAI-compatible server (a fake one here) the draft opens in the editor, clearly marked.
import { test, expect, chromium, request, type Browser } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const BASE = 'http://127.0.0.1:3210';
let cr: Browser;
test.beforeAll(async () => {
  cr = await chromium.launch();
});
test.afterAll(async () => {
  await cr?.close();
});

test('create a board with AI from the library (local AI server)', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const host = (await (await api.post('/api/host/local-login')).json()).token as string;
  const H = { authorization: `Bearer ${host}` };
  const before = (await (await api.get('/api/ai', { headers: H })).json()).config;

  const pc = await (await cr.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  // Not set up yet (Anthropic without a key): the dialog says what to do.
  await api.put('/api/ai', { headers: H, data: { config: { ...before, provider: 'anthropic' }, clearKey: true } });
  await pc.goto(`${BASE}/host/boards`);
  await pc.getByTestId('generate-board-open').click();
  await expect(pc.getByTestId('generate-board')).toContainText('Set up AI first');
  await expect(pc.getByTestId('generate-create')).toBeDisabled();
  await pc.keyboard.press('Escape');

  // A local AI server.
  const board = { categories: [{ name: 'Planets', clues: [{ clue: 'The red planet', answer: 'Mars' }, { clue: 'The largest planet', answer: 'Jupiter' }, { clue: 'The planet with the most famous rings', answer: 'Saturn' }] }, { name: 'Stars', clues: [{ clue: 'Our nearest star', answer: 'The Sun' }] }, { name: 'Space travel', clues: [] }], final: { category: 'Firsts', clue: 'First person on the Moon', answer: 'Neil Armstrong' } };
  const srv = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(board) } }] })));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`;
  await api.put('/api/ai', { headers: H, data: { config: { ...before, provider: 'openai', baseUrl: url, model: 'llama3.2' } } });
  try {
    await pc.reload();
    await pc.getByTestId('generate-board-open').click();
    await expect(pc.getByTestId('generate-board')).toContainText(`AI server at ${url}`);
    await pc.getByTestId('generate-topic').fill('The solar system');
    await pc.getByLabel('Categories').selectOption('3');
    await pc.getByLabel('Clues per category').selectOption('3');
    await pc.getByTestId('generate-create').click();
    await expect(pc).toHaveURL(/\/host\/boards\/[^/]+$/);
    await expect(pc.getByTestId('ai-generated-note')).toBeVisible();
    await expect(pc.getByRole('button', { name: /^Edit Planets 400/ })).toContainText('The largest planet');
    await expect(pc.getByRole('button', { name: /^Edit Stars 400/ })).toHaveAccessibleName(/unfinished/); // left for the host
    await pc.screenshot({ path: 'test-results/screens/editor-ai-board.png' });
    await api.delete(`/api/boards/${pc.url().split('/').pop()}`, { headers: H }); // keep the library as other tests expect it
  } finally {
    await api.put('/api/ai', { headers: H, data: { config: before } });
    await new Promise((r) => srv.close(r));
    await api.dispose();
  }
});
