// Optional AI answers for computer opponents (R3-14), with a fake provider client: the key is
// write-only and never leaves the server; failures, refusals, limits and "accidentally right"
// answers all fall back to offline answers without stalling the game.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { api, boot, createProfile, hostToken, sampleBoardId, TestClient } from './helpers';
import { DEFAULT_AI_CONFIG } from '../../src/shared/ai';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});
const KEY = 'sk-ant-test-SECRET-1234567890';

type Reply = { text?: string; refusal?: boolean; error?: Error; hang?: boolean };
function fakeProvider(s: Awaited<ReturnType<typeof boot>>, replies: Reply[]) {
  const calls: any[] = [];
  s.ai.makeClient = () =>
    ({
      beta: {
        messages: {
          create: async (body: any, opts: any) => {
            calls.push({ body, opts });
            const r = replies.length > 1 ? replies.shift()! : replies[0];
            if (r.hang) return new Promise(() => {});
            if (r.error) throw r.error;
            return { stop_reason: r.refusal ? 'refusal' : 'end_turn', content: r.refusal ? [] : [{ type: 'text', text: JSON.stringify({ answer: r.text }) }] };
          },
        },
      },
      models: { list: async function* () { yield { id: 'claude-opus-5-5' }; yield { id: 'claude-haiku-5-5' }; } },
    }) as unknown as Anthropic;
  return calls;
}

async function setup(replies: Reply[], cfg: Partial<typeof DEFAULT_AI_CONFIG> = {}) {
  const s = await boot();
  servers.push(s);
  const host = await hostToken(s);
  const calls = fakeProvider(s, replies);
  await api(s, 'PUT', '/api/ai', { config: { ...DEFAULT_AI_CONFIG, enabled: true, timeoutSeconds: 2, ...cfg }, apiKey: KEY }, host);
  s.games.bots.speed = 0.02;
  const alex = await createProfile(s, 'Alex');
  const boardId = await sampleBoardId(s, host);
  await api(s, 'POST', '/api/games', { boardId, mode: 'solo' }, host);
  const h = await TestClient.connect(s, 'host', host);
  const tv = await TestClient.connect(s, 'public');
  clients.push(h, tv);
  await h.act({ type: 'addPlayer', profileId: alex.id });
  await h.act({ type: 'addBot', name: 'Robo Rita', level: 'expert', ai: true });
  await h.act({ type: 'updateRules', rules: { ...h.state!.rules, categoryIntro: false } });
  await h.act({ type: 'startGame' });
  await h.act({ type: 'introSkip' });
  const bot = h.state!.competitors.find((c) => c.bot)!.id;
  /** Host buzzes for the bot so it must answer; returns the submission the host sees. */
  const answerOn = async (clueId: string, knows: boolean) => {
    s.games.bots.random = () => (knows ? 0 : 0.99);
    if (h.state!.phase === 'clue') await h.act({ type: 'closeClue' });
    await h.act({ type: 'selectClue', clueId });
    await h.act({ type: 'unlockBuzzers' });
    await h.act({ type: 'hostBuzz', competitorId: bot });
    const g = await h.waitState((x) => !!x?.clue?.submission, 6000);
    return g!.clue!.submission!;
  };
  return { s, host, h, tv, bot, calls, answerOn };
}

describe('AI answers for computer opponents (R3-14)', () => {
  it('keeps the API key write-only and out of the database, backups, broadcasts and errors', async () => {
    const { s, host, h, tv, answerOn } = await setup([{ error: new Error(`network down for key ${KEY}`) }]);
    const st = await api(s, 'GET', '/api/ai', undefined, host);
    expect(st.data).toMatchObject({ keySaved: true, ready: true, keyProtected: false });
    expect(JSON.stringify(st.data)).not.toContain(KEY);
    // Players and unauthenticated clients cannot read or change it.
    const p = await createProfile(s, 'Pat');
    expect((await api(s, 'GET', '/api/ai', undefined, p.token)).status).toBe(401);
    expect((await api(s, 'PUT', '/api/ai', { apiKey: 'sk-ant-evil-000000000' })).status).toBe(401);

    const sub = await answerOn('hist_1', true);
    expect(sub.via).toBe('local'); // provider failed → offline answer, game goes on
    expect(sub.warning).toMatch(/network down/);
    expect(sub.warning).not.toContain(KEY); // the error text is scrubbed
    await tv.waitState((g) => !!g?.clue?.submission);
    const tvSub = (tv.state!.clue as any).submission;
    expect(tvSub).toMatchObject({ answer: sub.answer });
    expect(tvSub.via).toBeUndefined(); // where answers come from is host-only
    expect((await api(s, 'GET', '/api/ai', undefined, host)).data.lastError).not.toContain(KEY);

    // Never in the database, a full backup, or anything broadcast to any client.
    s.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    for (const f of fs.readdirSync(s.dataDir).filter((x) => x.endsWith('.db') || x.endsWith('-wal'))) expect(fs.readFileSync(path.join(s.dataDir, f)).includes(KEY)).toBe(false);
    const backup = Buffer.from(await (await fetch(`${s.url}/api/admin/backup`, { headers: { authorization: `Bearer ${host}` } })).arrayBuffer());
    expect(backup.includes(KEY)).toBe(false);
    for (const c of [h, tv]) expect(JSON.stringify(c.messages)).not.toContain(KEY);
    expect(fs.existsSync(path.join(s.dataDir, 'secrets', 'ai-key-anthropic.txt'))).toBe(true);
    // Removing the key works and turns AI answers off.
    expect((await api(s, 'PUT', '/api/ai', { clearKey: true }, host)).data).toMatchObject({ keySaved: false, ready: false });
  });

  it('uses the AI answer when it works, and the host still judges it', async () => {
    const { h, calls, answerOn } = await setup([{ text: 'Who are the Inca?' }]);
    const sub = await answerOn('hist_1', true);
    expect(sub).toMatchObject({ answer: 'Who are the Inca?', via: 'ai' });
    expect(calls[0].body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(calls[0].body.messages[0].content).toContain('Machu Picchu');
    expect(h.state!.competitors.find((c) => c.bot)!.score).toBe(0);
    await h.act({ type: 'judge', result: 'correct' });
    expect(h.state!.competitors.find((c) => c.bot)!.score).toBe(200);
  });

  it('never lets a "wrong" AI answer be secretly right; refusals and timeouts fall back', async () => {
    const { answerOn } = await setup([{ text: 'The Inca' }, { refusal: true }, { hang: true }]);
    const wrong = await answerOn('hist_1', false);
    expect(wrong.via).toBe('local');
    expect(wrong.answer.toLowerCase()).not.toContain('inca');
    expect(wrong.warning).toMatch(/right answer/);
    const refused = await answerOn('hist_2', false);
    expect(refused).toMatchObject({ via: 'local' });
    expect(refused.warning).toMatch(/declined/);
    const started = Date.now();
    const slow = await answerOn('hist_3', true);
    expect(slow.via).toBe('local'); // waited at most the configured 2 s
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('stops using the AI at the per-game limit, honours "bot passes", and only for bots set to AI', async () => {
    const { h, calls, answerOn, bot } = await setup([{ text: 'Machu Picchu builders' }], { maxPerGame: 1, fallback: 'pass' });
    expect((await answerOn('hist_1', true)).via).toBe('ai');
    const capped = await answerOn('hist_2', true);
    expect(capped).toMatchObject({ via: 'local', answer: 'Pass' });
    expect(capped.warning).toMatch(/limit of 1/);
    expect(calls).toHaveLength(1);
    await h.act({ type: 'updateCompetitor', competitorId: bot, botAi: false });
    const local = await answerOn('hist_3', true);
    expect(local.via).toBe('local');
    expect(local.warning).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('test connection and model list go through the server', async () => {
    const s = await boot();
    servers.push(s);
    const host = await hostToken(s);
    expect((await api(s, 'GET', '/api/ai/models', undefined, host)).status).toBe(502); // no key yet
    fakeProvider(s, [{ text: 'ready' }]);
    await api(s, 'PUT', '/api/ai', { apiKey: KEY }, host);
    expect((await api(s, 'POST', '/api/ai/test', {}, host)).data).toMatchObject({ ok: true });
    expect((await api(s, 'GET', '/api/ai/models', undefined, host)).data.models).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
  });
});
