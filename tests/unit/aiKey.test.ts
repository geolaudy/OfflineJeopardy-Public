import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/server/db/db';
import { AiService } from '../../src/server/ai';

describe('AI key storage (R3-14)', () => {
  it('is encrypted with the desktop codec and readable only through it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-ai-'));
    const codec = { encrypt: (s: string) => Buffer.from(Buffer.from(s.split('').reverse().join(''), 'utf8').map((b) => b ^ 0x5a)), decrypt: (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a)).toString('utf8').split('').reverse().join('') };
    const ai = new AiService(openDatabase(':memory:'), dir, codec);
    ai.setKey('sk-ant-very-secret-key');
    const file = path.join(dir, 'secrets', 'ai-key-anthropic.bin');
    expect(fs.readFileSync(file).includes('sk-ant-very-secret-key')).toBe(false);
    expect(ai.status(null)).toMatchObject({ keySaved: true, keyProtected: true });
    ai.setKey(null);
    expect(fs.existsSync(file)).toBe(false);
    expect(ai.status(null).keySaved).toBe(false);
  });
});
