// R17-15: where OfflineJeopardy keeps its game data (database, profile pictures, clue media, sound
// files, fonts, AI settings, logs) and how the host moves it.
//
// The location itself is NOT in the data folder (the app would need the database to find the
// database): a small bootstrap file outside it — %APPDATA%\OfflineJeopardy\config.json in the
// Windows app (the same file the app always read `dataDir` from) — holds the chosen folder and a
// pending move. Nothing here deletes game data:
//   - a move is only *requested* while the app runs (validated, written to the bootstrap file); it
//     is carried out at the next start, before the database is opened, so no game can still be
//     writing to it and the copy cannot be an old snapshot of a running game,
//   - the copy goes into a staging folder beside the destination, is verified (every file and its
//     size; the copied database opens, passes SQLite's integrity check and has the same rows) and
//     only then renamed into place; any failure removes the staging copy and keeps the old location,
//   - the old folder always stays where it was (the host can delete it later); a destination that
//     already holds older game data is renamed aside ("…-old-<date>"), never overwritten,
//   - a configured folder that is missing at start (a USB drive not plugged in) is reported, and an
//     empty database is never created there silently (main.ts asks what to do).

import fs from 'node:fs';
import path from 'node:path';

export const DB_FILE = 'offlinejeopardy.db';

export interface PendingMove {
  from: string;
  to: string;
  /** copy: bring the current data along · use: switch to the game data already in `to`. */
  mode: 'copy' | 'use';
  requestedAt: number;
}

export interface MoveResult {
  ok: boolean;
  from: string;
  to: string;
  at: number;
  message: string;
  /** Older game data that was in the destination, renamed aside (kept). */
  keptOld?: string;
}

export interface Bootstrap {
  /** The chosen data folder; absent = the default location. */
  dataDir?: string;
  pendingMove?: PendingMove | null;
  lastMove?: MoveResult | null;
  /** Where the data was before the last move (kept, never deleted). */
  previousDataDir?: string;
}

export function readBootstrap(file: string): Bootstrap {
  try {
    const b = JSON.parse(fs.readFileSync(file, 'utf8')) as Bootstrap;
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}

/** Written to a temporary file first and renamed over the old one (no half-written file). */
export function writeBootstrap(file: string, b: Bootstrap) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(b, null, 2));
  fs.renameSync(tmp, file);
}

function updateBootstrap(file: string, patch: (b: Bootstrap) => Bootstrap) {
  const next = patch(readBootstrap(file));
  writeBootstrap(file, next);
  return next;
}

/** Windows paths compare without case; trailing separators do not matter. */
export function samePath(a: string, b: string) {
  const n = (p: string) => path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
}

function inside(child: string, parent: string) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function resolveDataDir(b: Bootstrap, defaultDir: string) {
  return b.dataDir ? path.resolve(b.dataDir) : path.resolve(defaultDir);
}

export function hasGameData(dir: string) {
  try {
    return fs.statSync(path.join(dir, DB_FILE)).isFile();
  } catch {
    return false;
  }
}

/** Every file below `dir` (relative paths, forward slashes) with its size. */
export function listFiles(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else if (e.isFile()) out.set(r, fs.statSync(full).size);
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}

export function folderSize(dir: string) {
  let bytes = 0;
  const files = listFiles(dir);
  for (const s of files.values()) bytes += s;
  return { bytes, files: files.size };
}

function freeBytes(dir: string): number | null {
  try {
    const st = fs.statfsSync(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

/** The nearest folder of `p` that exists (for free space before the folder is created). */
function existingAncestor(p: string) {
  let d = path.resolve(p);
  while (!fs.existsSync(d)) {
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return d;
}

export interface TargetCheck {
  ok: boolean;
  /** The folder the data will live in: the chosen one, or "OfflineJeopardyData" inside it when the
   *  chosen folder already holds other files. */
  target: string;
  /** The target already holds OfflineJeopardy game data. */
  existingData: boolean;
  needBytes: number;
  freeBytes: number | null;
  error?: string;
  /** Things the host should know (not blocking). */
  notes: string[];
}

/**
 * Checks a folder the host picked: a full path, not the current folder or inside it (or around it),
 * writable (a test file is written and removed), with room for the data. Nothing is moved here.
 */
export function checkTarget(chosen: string, current: string): TargetCheck {
  const fail = (error: string, target = chosen): TargetCheck => ({ ok: false, target, existingData: false, needBytes: 0, freeBytes: null, error, notes: [] });
  if (!chosen || !path.isAbsolute(chosen)) return fail('Choose a full folder path (for example D:\\Games\\OfflineJeopardy).');
  let target = path.resolve(chosen);
  if (samePath(target, current)) return fail('That is already where the game data is.');
  // A whole drive (a USB stick, D:) gets its own folder: a drive itself cannot be renamed into place.
  if (path.parse(target).root === target && !hasGameData(target)) target = path.join(target, 'OfflineJeopardyData');
  // A folder that already has game data is used as it is; an empty (or new) folder becomes the data
  // folder; a folder with other things in it gets its own "OfflineJeopardyData" folder inside.
  if (!hasGameData(target) && fs.existsSync(target)) {
    let entries: string[];
    try {
      if (!fs.statSync(target).isDirectory()) return fail('That is a file, not a folder.');
      entries = fs.readdirSync(target);
    } catch (e) {
      return fail(`Windows does not allow reading that folder (${(e as NodeJS.ErrnoException).code ?? 'error'}).`);
    }
    if (entries.length) target = path.join(target, 'OfflineJeopardyData');
  }
  if (samePath(target, current)) return fail('That is already where the game data is.');
  if (inside(target, current)) return fail('The new folder cannot be inside the current data folder.');
  if (inside(current, target)) return fail('The new folder cannot contain the current data folder.');
  const existingData = hasGameData(target);
  // Writable? Create the folder if needed, write and remove a test file, remove what was created.
  const base = existingAncestor(target);
  if (!base) return fail('That drive or network location is not available.', target);
  const created: string[] = [];
  try {
    for (let d = target; !fs.existsSync(d); d = path.dirname(d)) created.unshift(d);
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, `.oj-write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return fail(code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? 'Windows does not allow saving in that folder (read-only or no permission).' : `That folder cannot be used (${code ?? (e as Error).message}).`, target);
  } finally {
    // Only folders this check created, newest first, and only while still empty.
    for (const d of created.reverse()) {
      try {
        fs.rmdirSync(d);
      } catch {
        /* not empty or gone */
      }
    }
  }
  const size = folderSize(current);
  const needBytes = existingData ? 0 : size.bytes;
  const free = freeBytes(base);
  const notes: string[] = [];
  if (existingData) notes.push('This folder already has OfflineJeopardy game data.');
  if (/^\\\\/.test(target)) notes.push('A network folder must be reachable every time OfflineJeopardy starts.');
  if (free != null && free < needBytes * 1.1 + 50 * 1024 * 1024) return { ok: false, target, existingData, needBytes, freeBytes: free, error: 'There is not enough free space there.', notes };
  return { ok: true, target, existingData, needBytes, freeBytes: free, notes };
}

/** Saves a move for the next start (validated again then). */
export function requestMove(bootstrapFile: string, move: Omit<PendingMove, 'requestedAt'>) {
  return updateBootstrap(bootstrapFile, (b) => ({ ...b, pendingMove: { ...move, requestedAt: Date.now() } }));
}

export function cancelMove(bootstrapFile: string) {
  return updateBootstrap(bootstrapFile, (b) => ({ ...b, pendingMove: null }));
}

type Log = (...args: unknown[]) => void;

/** Row counts of every table (a copy must have exactly the same). */
async function tableCounts(dbFile: string) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = (db.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get() as { n: number }).n;
    return { integrity, counts };
  } finally {
    db.close();
  }
}

/**
 * Carries out a pending move (at start-up, before the database is opened). Returns the data folder
 * to use now — the new one after a verified move, otherwise the old one.
 */
export async function applyPendingMove(bootstrapFile: string, defaultDir: string, log: Log = () => {}, onStatus?: (s: string) => void): Promise<string> {
  const b = readBootstrap(bootstrapFile);
  const current = resolveDataDir(b, defaultDir);
  const move = b.pendingMove;
  if (!move) return current;
  const from = path.resolve(move.from);
  const to = path.resolve(move.to);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const finish = (result: Omit<MoveResult, 'at' | 'from' | 'to'>, dir: string) => {
    updateBootstrap(bootstrapFile, (x) => ({
      ...x,
      pendingMove: null,
      lastMove: { ...result, from, to, at: Date.now() },
      ...(result.ok ? { dataDir: samePath(to, defaultDir) ? undefined : to, previousDataDir: from } : {}),
    }));
    log(result.ok ? 'Data move done' : 'Data move failed', result.message);
    return dir;
  };
  if (!samePath(from, current)) return finish({ ok: false, message: 'The data folder changed since the move was requested — nothing was moved.' }, current);
  log('Moving game data', from, '→', to, move.mode);

  if (move.mode === 'use') {
    if (!hasGameData(to)) return finish({ ok: false, message: `No game data was found in ${to} — still using ${from}.` }, current);
    return finish({ ok: true, message: `Now using the game data in ${to}. The data in ${from} was left as it was.` }, to);
  }

  const staging = `${to}.moving-${stamp}`;
  let keptOld: string | undefined;
  try {
    onStatus?.('Copying your game data to the new folder…');
    if (!fs.existsSync(path.join(from, DB_FILE))) throw new Error(`There is no game data in ${from} to move.`);
    if (inside(to, from) || inside(from, to) || path.parse(to).root === to) throw new Error('The new folder cannot be used.');
    // Checked again now: the folder may have changed since the move was requested. Other people's
    // files are never renamed aside — only older OfflineJeopardy data.
    if (fs.existsSync(to) && !hasGameData(to) && fs.readdirSync(to).length) throw new Error(`${to} is no longer empty`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const free = freeBytes(path.dirname(to));
    const need = folderSize(from).bytes;
    if (free != null && free < need * 1.05) throw Object.assign(new Error('not enough free space'), { code: 'ENOSPC' });
    fs.rmSync(staging, { recursive: true, force: true });
    fs.cpSync(from, staging, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });

    onStatus?.('Checking the copy…');
    const src = listFiles(from);
    const dst = listFiles(staging);
    for (const [rel, size] of src) if (dst.get(rel) !== size) throw new Error(`The copy of ${rel} is incomplete.`);
    const [a, c] = await Promise.all([tableCounts(path.join(from, DB_FILE)), tableCounts(path.join(staging, DB_FILE))]);
    if (c.integrity !== 'ok') throw new Error(`The copied database failed its integrity check (${c.integrity}).`);
    for (const [t, n] of Object.entries(a.counts)) if (c.counts[t] !== n) throw new Error(`The copied database is missing rows (${t}).`);

    // Older game data in the destination is kept, renamed aside; an empty destination folder (the
    // one the host picked) makes room for the verified copy.
    if (fs.existsSync(to)) {
      if (hasGameData(to) || fs.readdirSync(to).length) {
        keptOld = `${to}-old-${stamp}`;
        fs.renameSync(to, keptOld);
      } else fs.rmdirSync(to);
    }
    fs.renameSync(staging, to);
    return finish({ ok: true, message: `Game data moved to ${to}. The old folder ${from} was kept — you can delete it once everything looks right.${keptOld ? ` Older data that was in the new folder is in ${keptOld}.` : ''}`, keptOld }, to);
  } catch (e) {
    log('Data move error', e);
    try {
      fs.rmSync(staging, { recursive: true, force: true }); // only our own unfinished copy
      if (keptOld && !fs.existsSync(to)) fs.renameSync(keptOld, to);
    } catch (cleanup) {
      log('Cleanup after a failed move', cleanup);
    }
    const code = (e as NodeJS.ErrnoException).code;
    const why = code === 'EACCES' || code === 'EPERM' ? 'Windows did not allow writing there' : code === 'ENOSPC' ? 'the drive is full' : code === 'EBUSY' ? 'a file was in use' : (e as Error).message;
    return finish({ ok: false, message: `The game data could not be moved (${why}). Nothing was changed — still using ${from}.` }, current);
  }
}

export type Availability = { ok: true } | { ok: false; reason: 'missing' | 'empty' };

/** A chosen (non-default) folder must exist and hold game data; the default folder may be new. */
export function checkAvailable(dir: string, isDefault: boolean): Availability {
  if (isDefault) return { ok: true };
  if (!fs.existsSync(dir)) return { ok: false, reason: 'missing' };
  if (!hasGameData(dir)) return { ok: false, reason: 'empty' };
  return { ok: true };
}
