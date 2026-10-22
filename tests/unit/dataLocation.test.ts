// R17-15: moving the game data folder — requested while the app runs, carried out and verified at the
// next start; nothing is ever deleted, and a failure keeps the old folder.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyPendingMove, cancelMove, checkAvailable, checkTarget, DB_FILE, hasGameData, readBootstrap, requestMove, resolveDataDir, writeBootstrap } from '../../src/server/dataLocation';

let root = '';
let boot = '';
let def = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-loc-'));
  boot = path.join(root, 'appdata', 'config.json');
  def = path.join(root, 'appdata', 'data');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** A data folder like the app's: a WAL database with rows, pictures, a sound file, a log. */
function makeData(dir: string, players = 3) {
  fs.mkdirSync(path.join(dir, 'media', 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'media', 'clues', 'b1'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  const db = new DatabaseSync(path.join(dir, DB_FILE));
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE boards (id TEXT, title TEXT); CREATE TABLE game_events (id INTEGER PRIMARY KEY, kind TEXT)');
  for (let i = 0; i < players; i++) db.prepare('INSERT INTO profiles VALUES (?, ?)').run(`p${i}`, `Player ${i} — Zoë`);
  db.prepare('INSERT INTO boards VALUES (?, ?)').run('b1', 'Starter Trivia Night');
  for (let i = 0; i < 50; i++) db.prepare('INSERT INTO game_events (kind) VALUES (?)').run('answer');
  db.close();
  fs.writeFileSync(path.join(dir, 'media', 'profiles', 'p0.webp'), Buffer.alloc(4096, 7));
  fs.writeFileSync(path.join(dir, 'media', 'clues', 'b1', 'map.png'), Buffer.alloc(20000, 3));
  fs.writeFileSync(path.join(dir, 'logs', 'main.log'), 'log line\n');
}
const rows = (dir: string, t: string) => {
  const db = new DatabaseSync(path.join(dir, DB_FILE), { readOnly: true });
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  db.close();
  return n;
};

describe('choosing a folder (checkTarget)', () => {
  it('accepts an empty or new folder (spaces, Unicode) and refuses the current folder, folders inside it, files and relative paths', () => {
    makeData(def);
    const fresh = path.join(root, 'Spiele Ordner', 'Jeopardy — Daten ✓');
    const c = checkTarget(fresh, def);
    expect(c).toMatchObject({ ok: true, target: fresh, existingData: false });
    expect(c.needBytes).toBeGreaterThan(24000);
    expect(fs.existsSync(fresh)).toBe(false); // the check leaves nothing behind
    expect(checkTarget(def, def).ok).toBe(false);
    expect(checkTarget(path.join(def, 'sub'), def).error).toMatch(/inside/);
    expect(checkTarget(path.join(root, 'appdata'), def).ok).toBe(true); // has other files → its own folder
    expect(checkTarget(path.join(root, 'appdata'), def).target).toBe(path.join(root, 'appdata', 'OfflineJeopardyData'));
    expect(checkTarget('relative\\folder', def).ok).toBe(false);
    fs.writeFileSync(path.join(root, 'a-file'), 'x');
    expect(checkTarget(path.join(root, 'a-file'), def).error).toMatch(/file/);
  });

  it('a folder with other files gets an OfflineJeopardyData folder inside; one with game data is reported', () => {
    makeData(def);
    const usb = path.join(root, 'usb');
    fs.mkdirSync(usb);
    fs.writeFileSync(path.join(usb, 'photos.txt'), 'mine');
    expect(checkTarget(usb, def)).toMatchObject({ ok: true, target: path.join(usb, 'OfflineJeopardyData') });
    const other = path.join(root, 'other-pc');
    makeData(other, 1);
    expect(checkTarget(other, def)).toMatchObject({ ok: true, target: other, existingData: true, needBytes: 0 });
  });

  it('refuses a location that does not exist at all (an unplugged drive)', () => {
    makeData(def);
    const r = checkTarget('Q:\\nothing\\here', def);
    if (process.platform === 'win32' && !fs.existsSync('Q:\\')) expect(r.error).toMatch(/not available/);
  });
});

describe('moving at the next start (applyPendingMove)', () => {
  it('copies everything, verifies it, switches the folder and keeps the old one', async () => {
    makeData(def);
    const to = path.join(root, 'Neuer Ordner ü', 'OJ');
    expect(checkTarget(to, def).ok).toBe(true);
    requestMove(boot, { from: def, to, mode: 'copy' });
    expect(resolveDataDir(readBootstrap(boot), def)).toBe(path.resolve(def)); // nothing changes until the restart
    const now = await applyPendingMove(boot, def);
    expect(now).toBe(path.resolve(to));
    const b = readBootstrap(boot);
    expect(b).toMatchObject({ dataDir: path.resolve(to), pendingMove: null, previousDataDir: path.resolve(def), lastMove: { ok: true } });
    expect(rows(to, 'profiles')).toBe(3);
    expect(rows(to, 'game_events')).toBe(50);
    expect(fs.readFileSync(path.join(to, 'media', 'clues', 'b1', 'map.png')).length).toBe(20000);
    expect(hasGameData(def)).toBe(true); // the old data is still there
    expect(fs.readdirSync(path.dirname(to)).filter((n) => n.includes('.moving-'))).toEqual([]);
    // Restore the default location: the old (now stale) default folder is renamed aside, never overwritten.
    fs.appendFileSync(path.join(to, 'logs', 'main.log'), 'newer\n');
    requestMove(boot, { from: to, to: def, mode: 'copy' });
    const back = await applyPendingMove(boot, def);
    expect(back).toBe(path.resolve(def));
    const b2 = readBootstrap(boot);
    expect(b2.dataDir).toBeUndefined(); // the default needs no entry
    expect(b2.lastMove?.keptOld).toMatch(/data-old-/);
    expect(fs.readFileSync(path.join(def, 'logs', 'main.log'), 'utf8')).toContain('newer');
    expect(hasGameData(b2.lastMove!.keptOld!)).toBe(true);
  });

  it('use mode switches to the data already in a folder without copying', async () => {
    makeData(def, 3);
    const other = path.join(root, 'other');
    makeData(other, 1);
    requestMove(boot, { from: def, to: other, mode: 'use' });
    expect(await applyPendingMove(boot, def)).toBe(path.resolve(other));
    expect(rows(other, 'profiles')).toBe(1);
    expect(rows(def, 'profiles')).toBe(3);
  });

  it('a failure keeps the old folder, removes only its own unfinished copy and says why', async () => {
    makeData(def);
    // The destination's parent is a file: the copy cannot be created.
    const blocker = path.join(root, 'blocker');
    fs.writeFileSync(blocker, 'x');
    requestMove(boot, { from: def, to: path.join(blocker, 'OJ'), mode: 'copy' });
    expect(await applyPendingMove(boot, def)).toBe(path.resolve(def));
    const b = readBootstrap(boot);
    expect(b.dataDir).toBeUndefined();
    expect(b.pendingMove).toBeNull();
    expect(b.lastMove).toMatchObject({ ok: false });
    expect(b.lastMove!.message).toMatch(/Nothing was changed/);
    expect(rows(def, 'profiles')).toBe(3);
  });

  it('a destination that gained other files since the request is not touched', async () => {
    makeData(def);
    const to = path.join(root, 'target');
    requestMove(boot, { from: def, to, mode: 'copy' });
    fs.mkdirSync(to);
    fs.writeFileSync(path.join(to, 'someone-elses.docx'), 'keep me');
    expect(await applyPendingMove(boot, def)).toBe(path.resolve(def));
    expect(fs.readdirSync(to)).toEqual(['someone-elses.docx']);
    expect(readBootstrap(boot).lastMove?.ok).toBe(false);
  });

  it('a corrupted copy is caught by the verification (the old folder stays in use)', async () => {
    makeData(def);
    const to = path.join(root, 'target');
    requestMove(boot, { from: def, to, mode: 'copy' });
    // Simulate a broken copy: the source has a file the copy will not match after we change it mid-way.
    const real = fs.cpSync;
    (fs as { cpSync: typeof fs.cpSync }).cpSync = ((src: string, dst: string, o: fs.CopySyncOptions) => {
      real(src, dst, o);
      fs.truncateSync(path.join(dst, 'media', 'clues', 'b1', 'map.png'), 10);
    }) as typeof fs.cpSync;
    try {
      expect(await applyPendingMove(boot, def)).toBe(path.resolve(def));
    } finally {
      (fs as { cpSync: typeof fs.cpSync }).cpSync = real;
    }
    expect(readBootstrap(boot).lastMove?.message).toMatch(/incomplete/);
    expect(fs.existsSync(to)).toBe(false);
  });

  it('a move requested from another folder than the one in use is refused; cancelling clears it', async () => {
    makeData(def);
    requestMove(boot, { from: path.join(root, 'elsewhere'), to: path.join(root, 'x'), mode: 'copy' });
    expect(await applyPendingMove(boot, def)).toBe(path.resolve(def));
    expect(readBootstrap(boot).lastMove?.ok).toBe(false);
    requestMove(boot, { from: def, to: path.join(root, 'x'), mode: 'copy' });
    cancelMove(boot);
    expect(readBootstrap(boot).pendingMove).toBeNull();
    expect(await applyPendingMove(boot, def)).toBe(path.resolve(def));
  });
});

describe('start-up checks (checkAvailable) and the bootstrap file', () => {
  it('a chosen folder that is missing or empty is reported; the default may be new', () => {
    expect(checkAvailable(path.join(root, 'usb-gone'), false)).toEqual({ ok: false, reason: 'missing' });
    fs.mkdirSync(path.join(root, 'empty'));
    expect(checkAvailable(path.join(root, 'empty'), false)).toEqual({ ok: false, reason: 'empty' });
    expect(checkAvailable(def, true)).toEqual({ ok: true });
  });

  it('reads an older config.json (dataDir only) and survives a damaged one', () => {
    fs.mkdirSync(path.dirname(boot), { recursive: true });
    fs.writeFileSync(boot, JSON.stringify({ dataDir: 'D:\\OJ' }));
    expect(resolveDataDir(readBootstrap(boot), def)).toBe(path.resolve('D:\\OJ'));
    fs.writeFileSync(boot, '{ broken');
    expect(readBootstrap(boot)).toEqual({});
    writeBootstrap(boot, { dataDir: def });
    expect(readBootstrap(boot).dataDir).toBe(def);
  });
});
