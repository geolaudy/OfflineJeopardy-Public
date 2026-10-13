// TV presentation settings (R2-22/23/24): saved and served publicly, custom sounds validated and
// managed only through their own endpoints.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, boot, hostToken } from './helpers';
import { DEFAULT_TV_FX, normalizeTvFx } from '../../src/shared/tvFx';

const servers: Awaited<ReturnType<typeof boot>>[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close().catch(() => {});
});

/** A tiny valid WAV file (8 kHz mono, 100 samples of silence). */
function wav(): Buffer {
  const samples = 100;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

describe('TV presentation settings', () => {
  it('normalises partial or invalid saved settings', () => {
    expect(normalizeTvFx(undefined)).toEqual(DEFAULT_TV_FX);
    const partial = normalizeTvFx({ boardIntro: false, unlock: { style: 'dot' } });
    expect(partial.boardIntro).toBe(false);
    expect(partial.unlock).toMatchObject({ style: 'dot', intensity: 'medium', persist: true });
    expect(partial.cues.buzz).toBe(true);
    expect(normalizeTvFx({ unlock: { style: 'fireworks' } })).toEqual(DEFAULT_TV_FX);
  });

  it('saves settings, serves them to the TV, and manages custom sound files safely', async () => {
    const s = await boot();
    servers.push(s);
    const token = await hostToken(s);
    expect((await api(s, 'GET', '/api/settings/public')).data.tvFx).toEqual(DEFAULT_TV_FX);

    const next = { ...DEFAULT_TV_FX, introSpeed: 'fast', unlock: { ...DEFAULT_TV_FX.unlock, style: 'top', color: '#22c55e' }, soundPack: 'custom', customSounds: { buzz: '/media/sounds/evil.wav' } };
    const put = await api(s, 'PUT', '/api/settings', { tvFx: next }, token);
    expect(put.status).toBe(200);
    const pub = (await api(s, 'GET', '/api/settings/public')).data.tvFx;
    expect(pub.unlock).toMatchObject({ style: 'top', color: '#22c55e' });
    expect(pub.introSpeed).toBe('fast');
    expect(pub.customSounds).toEqual({}); // files can only be set by uploading them
    expect((await api(s, 'PUT', '/api/settings', { tvFx: { ...next, unlock: { ...next.unlock, color: 'red' } } }, token)).status).toBe(400);

    const upload = async (cue: string, buf: Buffer, auth = true) => {
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(buf)]), 'sound.bin');
      return fetch(`${s.url}/api/sounds/${cue}`, { method: 'POST', headers: auth ? { authorization: `Bearer ${token}` } : {}, body: fd });
    };
    expect((await upload('buzz', wav(), false)).status).toBe(401);
    expect((await upload('buzz', Buffer.from('<html>not audio</html>'))).status).toBe(400);
    expect((await upload('nope', wav())).status).toBe(404);
    const ok = await upload('buzz', wav());
    expect(ok.status).toBe(200);
    const url = (await ok.json()).customSounds.buzz as string;
    expect(url).toMatch(/^\/media\/sounds\/buzz-[a-z0-9]+\.wav$/);
    const file = await fetch(s.url + url);
    expect(file.headers.get('content-type')).toContain('audio/wav');
    expect((await api(s, 'GET', '/api/settings/public')).data.tvFx.customSounds.buzz).toBe(url);

    // Replacing a sound removes the old file; deleting removes the setting and the file.
    const second = await (await upload('buzz', wav())).json();
    expect(second.customSounds.buzz).not.toBe(url);
    expect(fs.existsSync(path.join(s.dataDir, 'media', 'sounds', path.basename(url)))).toBe(false);
    const del = await api(s, 'DELETE', '/api/sounds/buzz', undefined, token);
    expect(del.data.customSounds).toEqual({});
    expect(fs.readdirSync(path.join(s.dataDir, 'media', 'sounds'))).toEqual([]);
  });
});
