// AI answers from a local / OpenAI-compatible server (Ollama, LM Studio…): no key needed, works
// without internet. A real HTTP server stands in for Ollama. Same safety rules as the cloud
// provider: the host still judges, a "wrong" answer that is right is refused, failures fall back.
import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';
import { DEFAULT_AI_CONFIG } from '../../src/shared/ai';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
const fakes: http.Server[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
  for (const f of fakes.splice(0)) await new Promise((r) => f.close(r));
});

/** A minimal OpenAI-compatible server: /v1/models and /v1/chat/completions. */
async function fakeOllama(reply: (body: any) => { status?: number; content?: string; hang?: boolean }) {
  const seen: { path: string; body: any; auth?: string }[] = [];
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ path: req.url!, body, auth: req.headers.authorization });
      if (req.url === '/v1/models') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'llama3.2' }, { id: 'qwen2.5' }] }));
      const r = reply(body);
      if (r.hang) return;
      if (r.status && r.status !== 200) return res.writeHead(r.status).end(JSON.stringify({ error: { message: 'model "nope" not found' } }));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: r.content ?? '' } }] }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  fakes.push(srv);
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, seen };
}

async function setup(baseUrl: string, model = 'llama3.2') {
  const s = await boot();
  servers.push(s);
  const host = await hostToken(s);
  const put = await api(s, 'PUT', '/api/ai', { config: { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', baseUrl, model, timeoutSeconds: 2 } }, host);
  expect(put.status).toBe(200);
  s.games.bots.speed = 0.02;
  const alex = await createProfile(s, 'Alex');
  await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
  const h = await TestClient.connect(s, 'host', host);
  clients.push(h);
  await h.act({ type: 'addPlayer', profileId: alex.id });
  await h.act({ type: 'addBot', name: 'Robo Rita', level: 'expert', ai: true });
  await h.act({ type: 'updateRules', rules: { ...h.state!.rules, categoryIntro: false } });
  await h.act({ type: 'startGame' });
  const bot = h.state!.competitors.find((c) => c.bot)!.id;
  const answerOn = async (clueId: string, knows: boolean) => {
    s.games.bots.random = () => (knows ? 0 : 0.99);
    if (h.state!.phase === 'clue') await h.act({ type: 'closeClue' });
    await h.act({ type: 'selectClue', clueId });
    await h.act({ type: 'unlockBuzzers' });
    await h.act({ type: 'hostBuzz', competitorId: bot });
    return (await h.waitState((x) => !!x?.clue?.submission, 6000))!.clue!.submission!;
  };
  return { s, host, h, answerOn };
}

describe('AI answers from a local / OpenAI-compatible server', () => {
  it('works without an API key: status, test connection, model list and bot answers', async () => {
    const fake = await fakeOllama((body) => (body.messages[1].content.includes('single word') ? { content: 'ready' } : { content: 'Sure! {"answer": "The Aztecs"}' }));
    const { s, host, answerOn } = await setup(fake.url);
    const st = (await api(s, 'GET', '/api/ai', undefined, host)).data;
    expect(st).toMatchObject({ keySaved: false, keyRequired: false, ready: true });
    expect((await api(s, 'POST', '/api/ai/test', undefined, host)).data).toMatchObject({ ok: true });
    expect((await api(s, 'GET', '/api/ai/models', undefined, host)).data.models).toEqual(['llama3.2', 'qwen2.5']);
    // A wrong-answer request; the model wraps its JSON in prose — still read correctly.
    const sub = await answerOn('hist_1', false);
    expect(sub).toMatchObject({ answer: 'The Aztecs', via: 'ai' });
    const chat = fake.seen.find((x) => x.path === '/v1/chat/completions' && !x.body.messages[1].content.includes('single word'))!;
    expect(chat.body).toMatchObject({ model: 'llama3.2', response_format: { type: 'json_object' }, stream: false });
    expect(chat.auth).toBeUndefined(); // no key, no header
  });

  it('refuses a "wrong" answer that is right, and falls back when the server is down or the model is missing', async () => {
    const fake = await fakeOllama(() => ({ content: '{"answer": "The Inca"}' })); // hist_1's real answer
    const { s, host, answerOn } = await setup(fake.url);
    const sub = await answerOn('hist_1', false);
    expect(sub.via).toBe('local');
    expect(sub.answer.toLowerCase()).not.toContain('inca');
    expect(sub.warning).toMatch(/right answer/);
    // Server gone: a clear message and an offline answer.
    const dead = `http://127.0.0.1:1/v1`;
    await api(s, 'PUT', '/api/ai', { config: { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', baseUrl: dead, model: 'llama3.2', timeoutSeconds: 2 } }, host);
    const t = (await api(s, 'POST', '/api/ai/test', undefined, host)).data;
    expect(t.ok).toBe(false);
    expect(t.error).toMatch(/Could not reach the AI server|took too long/);
    // Missing model: tells the host how to fix it.
    const missing = await fakeOllama(() => ({ status: 404 }));
    await api(s, 'PUT', '/api/ai', { config: { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'openai', baseUrl: missing.url, model: 'nope', timeoutSeconds: 2 } }, host);
    const t2 = (await api(s, 'POST', '/api/ai/test', undefined, host)).data;
    expect(t2.error).toMatch(/ollama pull nope/);
    // Only http(s) addresses are accepted.
    expect((await api(s, 'PUT', '/api/ai', { config: { ...DEFAULT_AI_CONFIG, provider: 'openai', baseUrl: 'file:///etc/passwd' } }, host)).status).toBe(400);
  });
});
