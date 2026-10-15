// Google Gemini as an AI provider (R5-11), against an injected fake of the Gemini REST API. Checks
// the request shapes from Google's docs, that the key only ever travels in the x-goog-api-key
// header, model listing (pagination + filtering), structured answers and boards, 429 →
// cooldown → offline answers without touching the network, and network failures → fallback.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';
import { DEFAULT_AI_CONFIG } from '../../src/shared/ai';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

const GKEY = 'AIzaSyFAKE-gemini-SECRET-0123456789';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

type Seen = { url: string; method: string; headers: Record<string, string>; body: any };
type Handler = (req: Seen) => { status?: number; json?: unknown; hang?: boolean; throws?: Error; headers?: Record<string, string> };

/** Pages of models.list: one page per call, then done. */
const MODEL_PAGES = [
  {
    models: [
      { name: 'models/embedding-001', displayName: 'Embedding 001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-pro-x', displayName: 'Gemini Pro X', supportedGenerationMethods: ['generateContent', 'countTokens'], thinking: true },
    ],
    nextPageToken: 'page-2',
  },
  { models: [{ name: 'models/gemini-9-flash', displayName: 'Gemini 9 Flash', supportedGenerationMethods: ['generateContent'], thinking: true }, { name: 'models/imagen-x', supportedGenerationMethods: ['predict'] }] },
];

const reply = (text: string, finishReason = 'STOP') => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }], usageMetadata: { totalTokenCount: 10 } } });

function fakeGemini(s: Awaited<ReturnType<typeof boot>>, onGenerate: Handler) {
  const seen: Seen[] = [];
  s.ai.fetchImpl = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const req: Seen = { url, method: init?.method ?? 'GET', headers, body: init?.body ? JSON.parse(String(init.body)) : null };
    seen.push(req);
    if (headers['x-goog-api-key'] !== GKEY) return new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }), { status: 400 });
    const u = new URL(url);
    if (u.pathname === '/v1beta/models') {
      const page = u.searchParams.get('pageToken') === 'page-2' ? MODEL_PAGES[1] : MODEL_PAGES[0];
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const r = onGenerate(req);
    if (r.throws) throw r.throws;
    if (r.hang)
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))));
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  };
  return seen;
}

const rateLimited = (retryDelay = '43s') => ({
  status: 429,
  json: {
    error: {
      code: 429,
      message: `You exceeded your current quota, please check your plan and billing details. (key ${GKEY})`,
      status: 'RESOURCE_EXHAUSTED',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-9-flash', location: 'global' }, quotaValue: '10' }] },
        { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Learn more about Gemini API quotas', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
      ],
    },
  },
});

async function setup(onGenerate: Handler, cfg: Partial<typeof DEFAULT_AI_CONFIG> = {}) {
  const s = await boot();
  servers.push(s);
  const host = await hostToken(s);
  const seen = fakeGemini(s, onGenerate);
  const put = await api(s, 'PUT', '/api/ai', { config: { ...DEFAULT_AI_CONFIG, enabled: true, provider: 'gemini', model: 'gemini-9-flash', timeoutSeconds: 2, ...cfg }, apiKey: GKEY }, host);
  expect(put.status).toBe(200);
  s.games.bots.speed = 0.02;
  const alex = await createProfile(s, 'Alex');
  await api(s, 'POST', '/api/games', { boardId: await sampleBoardId(s, host), mode: 'solo' }, host);
  const h = await TestClient.connect(s, 'host', host);
  const tv = await TestClient.connect(s, 'public');
  clients.push(h, tv);
  await h.act({ type: 'addPlayer', profileId: alex.id });
  await h.act({ type: 'addBot', name: 'Robo Rita', level: 'expert', ai: true });
  await h.act({ type: 'updateRules', rules: { ...h.state!.rules, categoryIntro: false } });
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  const bot = h.state!.competitors.find((c) => c.bot)!.id;
  const answerOn = async (clueId: string, knows: boolean) => {
    s.games.bots.random = () => (knows ? 0 : 0.99);
    if (h.state!.phase === 'clue') await h.act({ type: 'closeClue' });
    await h.act({ type: 'selectClue', clueId });
    await h.act({ type: 'unlockBuzzers' });
    await h.act({ type: 'hostBuzz', competitorId: bot });
    return (await h.waitState((x) => !!x?.clue?.submission, 6000))!.clue!.submission!;
  };
  return { s, host, h, tv, seen, answerOn };
}

const generateCalls = (seen: Seen[]) => seen.filter((r) => r.url.includes(':generateContent'));

describe('Google Gemini provider (R5-11)', () => {
  it('lists models from every page, keeps only generateContent models, and sends the key only in the header', async () => {
    const { s, host, seen } = await setup(() => reply('{}'));
    const r = await api(s, 'GET', '/api/ai/models', undefined, host);
    expect(r.status).toBe(200);
    expect(r.data.models).toEqual(['gemini-pro-x', 'gemini-9-flash']);
    expect(r.data.options).toEqual([
      { id: 'gemini-pro-x', label: 'Gemini Pro X (gemini-pro-x)' },
      { id: 'gemini-9-flash', label: 'Gemini 9 Flash (gemini-9-flash)' },
    ]);
    const lists = seen.filter((x) => new URL(x.url).pathname === '/v1beta/models');
    expect(lists).toHaveLength(2);
    expect(new URL(lists[1].url).searchParams.get('pageToken')).toBe('page-2');
    for (const x of seen) {
      expect(x.url.startsWith(BASE)).toBe(true);
      expect(x.url).not.toContain(GKEY);
      expect(new URL(x.url).searchParams.has('key')).toBe(false);
      expect(x.headers['x-goog-api-key']).toBe(GKEY);
      expect(x.headers.authorization).toBeUndefined();
    }
    expect(JSON.stringify(r.data)).not.toContain(GKEY);
    // A wrong key: a plain message, never the key.
    await api(s, 'PUT', '/api/ai', { apiKey: 'AIzaSy-wrong-key-000000' }, host);
    const bad = await api(s, 'GET', '/api/ai/models', undefined, host);
    expect(bad.status).toBe(502);
    expect(bad.data.error).toMatch(/Google did not accept the API key/);
  });

  it('test connection without a model picks the first Flash model and reports it', async () => {
    const { s, host, seen } = await setup(() => reply('ready'), { model: '' });
    const before = (await api(s, 'GET', '/api/ai', undefined, host)).data;
    expect(before).toMatchObject({ keySaved: true, keyRequired: true, ready: false, modelMissing: true });
    const t = (await api(s, 'POST', '/api/ai/test', {}, host)).data;
    expect(t).toMatchObject({ ok: true, model: 'gemini-9-flash' });
    expect(t.note).toMatch(/gemini-9-flash was selected/);
    const after = (await api(s, 'GET', '/api/ai', undefined, host)).data;
    expect(after).toMatchObject({ ready: true, modelMissing: false, config: { model: 'gemini-9-flash' } });
    const call = generateCalls(seen)[0];
    expect(call.url).toBe(`${BASE}/models/gemini-9-flash:generateContent`);
    expect(call.method).toBe('POST');
    expect(call.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'You are a connection test.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }],
      generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: 'LOW' } },
    });
  });

  it('bots answer with Gemini using structured JSON output; the host still judges', async () => {
    const { h, seen, answerOn } = await setup(() => reply('{"answer": "Who are the Inca?"}'));
    const sub = await answerOn('hist_1', true);
    expect(sub).toMatchObject({ answer: 'Who are the Inca?', via: 'ai' });
    const call = generateCalls(seen)[0];
    expect(call.body.contents[0].parts[0].text).toContain('Machu Picchu');
    expect(call.body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' } }, required: ['answer'], propertyOrdering: ['answer'] },
      maxOutputTokens: 1024,
    });
    expect(JSON.stringify(call.body.generationConfig.responseSchema)).not.toContain('additionalProperties');
    await h.act({ type: 'judge', result: 'correct' });
    expect(h.state!.competitors.find((c) => c.bot)!.score).toBe(200);
  });

  it('429 RESOURCE_EXHAUSTED: pauses Gemini, bots answer offline at once without calling Google again', async () => {
    const { s, host, h, tv, seen, answerOn } = await setup(() => rateLimited('43s'));
    const first = await answerOn('hist_1', true);
    expect(first.via).toBe('local');
    expect(first.warning).toMatch(/Gemini free-tier limit reached/);
    expect(first.warning).not.toContain(GKEY);
    expect(generateCalls(seen)).toHaveLength(1);
    const st = (await api(s, 'GET', '/api/ai', undefined, host)).data;
    expect(st.cooldown.message).toMatch(/^Gemini free-tier limit reached — offline answers until \d{1,2}[:.]\d{2}/);
    expect(st.cooldown.until - Date.now()).toBeGreaterThan(38_000);
    expect(st.cooldown.until - Date.now()).toBeLessThanOrEqual(43_000);
    expect(st.lastError).not.toContain(GKEY);

    // During the pause: offline straight away, no network, and the board generator says so too.
    const started = Date.now();
    const second = await answerOn('hist_2', true);
    expect(second.via).toBe('local');
    expect(second.warning).toMatch(/paused until/);
    expect(Date.now() - started).toBeLessThan(1500);
    const board = await api(s, 'POST', '/api/ai/generate-board', { topic: 'Space' }, host);
    expect(board.status).toBe(502);
    expect(board.data.error).toMatch(/free-tier limit reached/);
    expect(generateCalls(seen)).toHaveLength(1);

    // After the pause has passed, requests go out again.
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    expect((await api(s, 'GET', '/api/ai', undefined, host)).data.cooldown).toBeNull();
    await answerOn('hist_3', true);
    expect(generateCalls(seen)).toHaveLength(2);
    vi.restoreAllMocks();

    for (const c of [h, tv]) expect(JSON.stringify(c.messages)).not.toContain(GKEY);
  });

  it('network failures and timeouts fall back to offline answers without freezing the game', async () => {
    let mode: 'down' | 'hang' = 'down';
    const { s, host, answerOn } = await setup(() => (mode === 'down' ? { throws: new TypeError('fetch failed') } : { hang: true }));
    const down = await answerOn('hist_1', true);
    expect(down.via).toBe('local');
    expect(down.warning).toMatch(/Could not reach Google Gemini/);
    mode = 'hang';
    const started = Date.now();
    const slow = await answerOn('hist_2', true);
    expect(slow.via).toBe('local');
    expect(slow.warning).toMatch(/took too long/);
    expect(Date.now() - started).toBeLessThan(5000);
    // Not a rate limit: no pause.
    expect((await api(s, 'GET', '/api/ai', undefined, host)).data.cooldown).toBeNull();
  });

  it('retries once without optional settings a model rejects, then remembers that', async () => {
    const { s, host, seen } = await setup((req) =>
      req.body.generationConfig.thinkingConfig
        ? { status: 400, json: { error: { code: 400, message: 'Thinking is not supported by this model.', status: 'INVALID_ARGUMENT' } } }
        : reply('{"clue": "This planet has a Great Red Spot.", "answer": "Jupiter"}'),
    );
    const w = await api(s, 'POST', '/api/ai/clue', { mode: 'write', category: 'Planets', value: 400, answer: 'Jupiter' }, host);
    expect(w.data).toEqual({ question: 'This planet has a Great Red Spot.', answer: 'Jupiter' });
    expect(generateCalls(seen)).toHaveLength(2);
    await api(s, 'POST', '/api/ai/clue', { mode: 'write', category: 'Planets', value: 400, answer: 'Jupiter' }, host);
    expect(generateCalls(seen)).toHaveLength(3); // plain request straight away
    expect(generateCalls(seen)[2].body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('writes a board through Gemini with a converted response schema', async () => {
    const board = { categories: [{ name: 'Moons', clues: [{ clue: 'Largest moon of Saturn', answer: 'Titan' }] }], final: { category: 'Space firsts', clue: 'First person in space', answer: 'Yuri Gagarin' } };
    const { s, host, seen } = await setup(() => reply(JSON.stringify(board)));
    const r = await api(s, 'POST', '/api/ai/generate-board', { topic: 'Space', categories: 1, rows: 3, final: true }, host);
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ filled: 1, total: 3 });
    const cfg = generateCalls(seen)[0].body.generationConfig;
    expect(cfg.maxOutputTokens).toBe(16000);
    expect(cfg.thinkingConfig).toBeUndefined();
    expect(cfg.responseSchema.properties.categories).toMatchObject({ type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, clues: { type: 'ARRAY' } } } });
    expect(JSON.stringify(cfg.responseSchema)).not.toContain('additionalProperties');
  });

  it('a blocked reply counts as a refusal and falls back', async () => {
    const { answerOn } = await setup(() => ({ json: { promptFeedback: { blockReason: 'SAFETY' } } }));
    const sub = await answerOn('hist_1', true);
    expect(sub).toMatchObject({ via: 'local' });
    expect(sub.warning).toMatch(/declined/);
  });
});

describe('API keys per provider (R5-11)', () => {
  it('keeps one key per provider: switching never loses or reuses another provider’s key', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    const put = (body: unknown) => api(s, 'PUT', '/api/ai', body, host);
    const ANT = 'sk-ant-test-SECRET-1234567890';
    expect((await put({ config: { ...DEFAULT_AI_CONFIG, provider: 'anthropic' }, apiKey: ANT })).data.keySaved).toBe(true);
    // Gemini has its own (empty) key slot, and its model may be empty until chosen.
    const g = (await put({ config: { ...DEFAULT_AI_CONFIG, provider: 'gemini', model: '' } })).data;
    expect(g).toMatchObject({ keySaved: false, keyRequired: true, modelMissing: true });
    expect((await put({ apiKey: GKEY })).data.keySaved).toBe(true);
    expect((await put({ config: { ...DEFAULT_AI_CONFIG, provider: 'anthropic' } })).data.keySaved).toBe(true);
    // Removing Anthropic's key leaves Gemini's alone.
    expect((await put({ clearKey: true })).data.keySaved).toBe(false);
    expect((await put({ config: { ...DEFAULT_AI_CONFIG, provider: 'gemini', model: 'gemini-9-flash' } })).data.keySaved).toBe(true);
    const secrets = path.join(s.dataDir, 'secrets');
    expect(fs.readdirSync(secrets).sort()).toEqual(['ai-key-gemini.txt']);
    expect(fs.readFileSync(path.join(secrets, 'ai-key-gemini.txt'), 'utf8')).toBe(GKEY);
    // Only Gemini may have no model.
    expect((await put({ config: { ...DEFAULT_AI_CONFIG, provider: 'anthropic', model: '' } })).status).toBe(400);
    // Never in the database or a backup.
    s.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    for (const f of fs.readdirSync(s.dataDir).filter((x) => x.endsWith('.db') || x.endsWith('-wal'))) expect(fs.readFileSync(path.join(s.dataDir, f)).includes(GKEY)).toBe(false);
    const backup = Buffer.from(await (await fetch(`${s.url}/api/admin/backup`, { headers: { authorization: `Bearer ${host}` } })).arrayBuffer());
    expect(backup.includes(GKEY)).toBe(false);
    // Players cannot see or change any of it.
    const p = await createProfile(s, 'Pat');
    expect((await api(s, 'GET', '/api/ai', undefined, p.token)).status).toBe(401);
    expect((await api(s, 'GET', '/api/ai/models', undefined, p.token)).status).toBe(401);
  });
});
