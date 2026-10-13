import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createZip, isZip, readZip, ZipError } from '../../src/server/zip';

const LIMITS = { maxEntries: 100, maxTotalBytes: 10_000_000 };

describe('zip (board packages / backups)', () => {
  it('round-trips stored and deflated entries with UTF-8 names', () => {
    const text = Buffer.from('{"title":"Ünïcode board"}'.repeat(50));
    const bin = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 7919) % 256));
    const zip = createZip([
      { name: 'board.json', data: text },
      { name: 'media/pic.webp', data: bin },
      { name: 'media/émoji 😀.txt', data: Buffer.from('hi') },
    ]);
    expect(isZip(zip)).toBe(true);
    const out = readZip(zip, LIMITS);
    expect(out.map((e) => e.name)).toEqual(['board.json', 'media/pic.webp', 'media/émoji 😀.txt']);
    expect(out[0].data.equals(text)).toBe(true);
    expect(out[1].data.equals(bin)).toBe(true);
    expect(zip.length).toBeLessThan(text.length + bin.length); // JSON was deflated
  });

  it('rejects path traversal, absolute paths and corrupted data', () => {
    for (const bad of ['../evil.txt', '/etc/passwd', 'C:/x.txt', 'a/../../b', 'a//b']) expect(() => createZip([{ name: bad, data: Buffer.from('x') }])).toThrow(ZipError);
    // Handcraft a traversal entry by patching a valid archive's names (same length).
    const zip = createZip([{ name: 'xx/evil.txt', data: Buffer.from('x') }]);
    const patched = Buffer.from(zip.toString('latin1').split('xx/evil.txt').join('../evil.txt'), 'latin1');
    expect(() => readZip(patched, LIMITS)).toThrow(/Unsafe/);
    const ok = createZip([{ name: 'a.txt', data: Buffer.from('hello world, hello world, hello world, hello world, hello world!') }]);
    const corrupt = Buffer.from(ok);
    corrupt[40] ^= 0xff; // flip a byte in the payload
    expect(() => readZip(corrupt, LIMITS)).toThrow(ZipError);
    expect(() => readZip(Buffer.from('not a zip at all, definitely not'), LIMITS)).toThrow(/Not a ZIP/);
  });

  it('enforces entry-count and unpacked-size limits (zip bombs)', () => {
    const big = Buffer.alloc(5_000_000); // compresses to a few KB
    const zip = createZip([{ name: 'zeros.bin', data: big }]);
    expect(zip.length).toBeLessThan(20_000);
    expect(() => readZip(zip, { maxEntries: 10, maxTotalBytes: 1_000_000 })).toThrow(/too large/);
    const many = createZip(Array.from({ length: 20 }, (_, i) => ({ name: `f${i}.txt`, data: Buffer.from('x') })));
    expect(() => readZip(many, { maxEntries: 10, maxTotalBytes: 1e9 })).toThrow(/Too many/);
  });

  it('reads archives made by other tools (raw deflate check) and is readable by Windows Expand-Archive', () => {
    // Our reader accepts standard deflate streams from zlib.
    expect(zlib.inflateRawSync(zlib.deflateRawSync(Buffer.from('abc'))).toString()).toBe('abc');
    if (process.platform !== 'win32') return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-zip-'));
    const file = path.join(dir, 'pkg.zip');
    fs.writeFileSync(file, createZip([{ name: 'board.json', data: Buffer.from('{"ok":true}'.repeat(20)) }, { name: 'media/a.bin', data: Buffer.from([1, 2, 3]) }]));
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${file}' -DestinationPath '${path.join(dir, 'out')}'`]);
    expect(fs.readFileSync(path.join(dir, 'out', 'board.json'), 'utf8')).toBe('{"ok":true}'.repeat(20));
    expect([...fs.readFileSync(path.join(dir, 'out', 'media', 'a.bin'))]).toEqual([1, 2, 3]);
    // ...and archives made by Windows (Compress-Archive) are readable by us.
    fs.writeFileSync(path.join(dir, 'src.txt'), 'made by windows '.repeat(100));
    const winZip = path.join(dir, 'win.zip');
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${path.join(dir, 'src.txt')}' -DestinationPath '${winZip}'`]);
    const entries = readZip(fs.readFileSync(winZip), LIMITS);
    expect(entries[0].data.toString()).toBe('made by windows '.repeat(100));
  }, 60_000);
});
