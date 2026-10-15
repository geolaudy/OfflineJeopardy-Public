// AI provider registry pieces (R5-11): key migration to per-provider files, Gemini error parsing,
// schema conversion and the Pacific-midnight reset used for daily quotas.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, setSetting } from '../../src/server/db/db';
import { AiService, pickDefaultModel } from '../../src/server/ai';
import { createGeminiProvider, msUntilPacificMidnight, parseDuration, toGeminiSchema } from '../../src/server/aiProviders/gemini';
import { DEFAULT_AI_CONFIG } from '../../src/shared/ai';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'oj-aip-'));

describe('per-provider API key files', () => {
  it('moves the old single key file to the provider that was configured', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'secrets'));
    fs.writeFileSync(path.join(dir, 'secrets', 'ai-key.txt'), 'AIza-legacy-key-123456');
    const db = openDatabase(':memory:');
    setSetting(db, 'aiConfig', { ...DEFAULT_AI_CONFIG, provider: 'gemini', model: 'gemini-9-flash' });
    const ai = new AiService(db, dir, null);
    expect(fs.existsSync(path.join(dir, 'secrets', 'ai-key.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'secrets', 'ai-key-gemini.txt'), 'utf8')).toBe('AIza-legacy-key-123456');
    expect(ai.status(null).keySaved).toBe(true);
    ai.setConfig({ ...DEFAULT_AI_CONFIG, provider: 'anthropic' });
    expect(ai.status(null).keySaved).toBe(false); // not reused for another provider
  });

  it('defaults to Anthropic (the only key-based provider before R5-11) and keeps encryption', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'secrets'));
    const codec = { encrypt: (s: string) => Buffer.from(s.split('').reverse().join('')), decrypt: (b: Buffer) => b.toString('utf8').split('').reverse().join('') };
    fs.writeFileSync(path.join(dir, 'secrets', 'ai-key.bin'), codec.encrypt('sk-ant-legacy-0000000'));
    const ai = new AiService(openDatabase(':memory:'), dir, codec);
    expect(fs.existsSync(path.join(dir, 'secrets', 'ai-key-anthropic.bin'))).toBe(true);
    expect(ai.status(null)).toMatchObject({ keySaved: true, keyProtected: true, config: { provider: 'anthropic' } });
  });
});

describe('Gemini helpers', () => {
  it('parses RetryInfo durations and finds the daily reset', () => {
    expect(parseDuration('43s')).toBe(43_000);
    expect(parseDuration('1.5s')).toBe(1500);
    expect(parseDuration('soon')).toBeNull();
    // 23:30 Pacific (07:30 UTC in summer) → 30 minutes to midnight.
    expect(msUntilPacificMidnight(new Date('2026-07-01T06:30:00Z'))).toBe(30 * 60_000);
  });

  it('converts JSON Schema to the responseSchema subset', () => {
    expect(toGeminiSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'string' } } }, required: ['a'], additionalProperties: false })).toEqual({
      type: 'OBJECT',
      properties: { a: { type: 'ARRAY', items: { type: 'STRING' } } },
      propertyOrdering: ['a'],
      required: ['a'],
    });
  });

  it('a used-up daily free quota pauses until the reset; model names cannot reach the URL path unchecked', async () => {
    const calls: string[] = [];
    const daily = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
    const p = createGeminiProvider(() => ({
      fetch: async (u) => (calls.push(String(u)), new Response(JSON.stringify(daily), { status: 429 })),
      makeAnthropic: () => {
        throw new Error('unused');
      },
    }));
    const cfg = { ...DEFAULT_AI_CONFIG, provider: 'gemini' as const, model: 'gemini-9-flash' };
    const err = await p.chat(cfg, 'k-123', { kind: 'answer', system: 's', prompt: 'p', timeoutMs: 1000 }).catch((e) => e);
    const rl = p.rateLimit(err)!;
    expect(rl.label).toBe('Gemini free-tier limit reached');
    expect(rl.retryAfterMs).toBeGreaterThanOrEqual(60_000);
    expect(rl.retryAfterMs).toBeLessThanOrEqual(24 * 3600_000);
    await expect(p.chat({ ...cfg, model: '../../files' }, 'k-123', { kind: 'answer', system: 's', prompt: 'p', timeoutMs: 1000 })).rejects.toThrow(/model name looks wrong/);
    await expect(p.chat({ ...cfg, model: '' }, 'k-123', { kind: 'answer', system: 's', prompt: 'p', timeoutMs: 1000 })).rejects.toThrow(/Choose a Gemini model/);
    expect(calls).toHaveLength(1);
  });

  it('picks a Flash model by default, else the first', () => {
    expect(pickDefaultModel([{ id: 'gemini-pro', label: '' }, { id: 'gemini-flash-lite', label: '' }])).toBe('gemini-flash-lite');
    expect(pickDefaultModel([{ id: 'gemini-pro', label: '' }])).toBe('gemini-pro');
    expect(pickDefaultModel([])).toBeNull();
  });
});
