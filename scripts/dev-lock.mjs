#!/usr/bin/env node
// Development lock: only one computer develops OfflineJeopardy at a time.
// See DEVELOPMENT_LOCK.md. The lock lives on its own branch (refs/heads/dev-lock) of the GitHub
// remote; every change is a compare-and-swap push (expected old commit), so two computers can
// never both win. Nothing here touches main, the working tree or the index.
//
//   node scripts/dev-lock.mjs status | acquire [--task ..] | release | recover [--confirm]
//                              | check | renew | heartbeat | task <text> | guard | activity | session-start
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const LOCK_REF = env.OJ_LOCK_REF || 'refs/heads/dev-lock';
const REMOTE = env.OJ_LOCK_REMOTE || 'origin';
const HEARTBEAT_MS = Number(env.OJ_LOCK_HEARTBEAT_MS) || 3 * 60_000;
const TTL_MS = Number(env.OJ_LOCK_TTL_MS) || 15 * 60_000;
const IDLE_MS = Number(env.OJ_LOCK_IDLE_MS) || 60 * 60_000;
const TIME_OFFSET_MS = Number(env.OJ_LOCK_TIME_OFFSET_MS) || 0; // tests only: pretend the clock is later
const FILE = 'session.json';
const SCRIPT = fileURLToPath(import.meta.url);
const REPO_OF_SCRIPT = path.resolve(path.dirname(SCRIPT), '..');

// Exit codes: 0 ok · 1 refused (locked by someone else, not the owner, …) · 2 cannot verify (network)
const EXIT_OK = 0, EXIT_REFUSED = 1, EXIT_UNVERIFIED = 2;

class LockError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

// ---------- git ----------

const gitEnv = {
  ...env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_AUTHOR_NAME: 'OfflineJeopardy dev lock',
  GIT_AUTHOR_EMAIL: 'dev-lock@offlinejeopardy.invalid',
  GIT_COMMITTER_NAME: 'OfflineJeopardy dev lock',
  GIT_COMMITTER_EMAIL: 'dev-lock@offlinejeopardy.invalid',
};

function git(args, { cwd = process.cwd(), input, allowFail = false, timeout = 60_000 } = {}) {
  const r = spawnSync('git', args, { cwd, input, env: gitEnv, encoding: 'utf8', timeout, windowsHide: true });
  if (r.error) throw new LockError('network', `git ${args[0]} failed: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) throw new LockError('git', `git ${args.join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function gitCommonDir(cwd = process.cwd()) {
  const dir = git(['rev-parse', '--git-common-dir'], { cwd }).out;
  return path.resolve(cwd, dir);
}

function remoteUrl(cwd) {
  return git(['remote', 'get-url', REMOTE], { cwd, allowFail: true }).out;
}

/** Reads the shared lock: { sha, record } (both null when the lock ref does not exist yet). */
function readRemote(cwd = process.cwd()) {
  const ls = git(['ls-remote', '--exit-code', REMOTE, LOCK_REF], { cwd, allowFail: true });
  if (ls.code === 2) return { sha: null, record: null };
  if (ls.code !== 0) throw new LockError('network', `Cannot reach the '${REMOTE}' remote to read the development lock.\n${ls.err}`);
  const localRef = 'refs/oj-dev-lock/remote';
  const f = git(['fetch', '--no-tags', '--quiet', REMOTE, `+${LOCK_REF}:${localRef}`], { cwd, allowFail: true });
  if (f.code !== 0) throw new LockError('network', `Cannot fetch the development lock from '${REMOTE}'.\n${f.err}`);
  const sha = git(['rev-parse', localRef], { cwd }).out;
  const raw = git(['show', `${sha}:${FILE}`], { cwd, allowFail: true });
  let record = null;
  try { record = JSON.parse(raw.out); } catch { record = { status: 'corrupt' }; }
  return { sha, record };
}

/** Compare-and-swap: publish `record` only if the lock ref is still `expectedSha` (null = must not exist). */
function writeRemote(record, expectedSha, message, cwd = process.cwd()) {
  const blob = git(['hash-object', '-w', '--stdin'], { cwd, input: JSON.stringify(record, null, 2) + '\n' }).out;
  const tree = git(['mktree'], { cwd, input: `100644 blob ${blob}\t${FILE}\n` }).out;
  const commit = git(['commit-tree', tree, ...(expectedSha ? ['-p', expectedSha] : []), '-m', message], { cwd }).out;
  const push = git(['push', '--no-verify', '--porcelain', `--force-with-lease=${LOCK_REF}:${expectedSha ?? ''}`, REMOTE, `${commit}:${LOCK_REF}`], { cwd, allowFail: true });
  // Never trust the push result alone: read the ref back.
  let now;
  try {
    now = readRemote(cwd);
  } catch (e) {
    throw new LockError('network', `The lock update could not be verified (${e.message}). Treat the lock as NOT held.`);
  }
  if (now.sha === commit) return { sha: commit, record };
  if (push.code === 0) throw new LockError('git', 'The lock push reported success but the remote shows a different lock. Treat the lock as NOT held.');
  if (now.sha !== expectedSha) throw new LockError('conflict', 'Another session changed the lock at the same moment.');
  throw new LockError('git', `The remote refused the lock update:\n${push.err || push.out}`);
}

// ---------- time ----------

/** UTC "now" from GitHub's Date header when the remote is GitHub, so computers with wrong clocks agree. */
async function serverNow(cwd) {
  const local = Date.now() + TIME_OFFSET_MS;
  const url = env.OJ_LOCK_TIME_URL ?? (/github\.com/i.test(remoteUrl(cwd)) ? 'https://api.github.com' : 'local');
  if (url === 'local') return { ms: local, source: 'local clock' };
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const date = Date.parse(res.headers.get('date') || '');
    if (Number.isFinite(date)) return { ms: date + TIME_OFFSET_MS, source: 'GitHub server time' };
  } catch { /* fall through */ }
  return { ms: local, source: 'local clock (GitHub time unavailable)' };
}

const iso = (ms) => new Date(ms).toISOString();

// ---------- local state (per clone, never committed) ----------

function statePath(cwd) { return path.join(gitCommonDir(cwd), 'oj-dev-lock.json'); }
function logPath(cwd) { return path.join(gitCommonDir(cwd), 'oj-dev-lock.log'); }
function readState(cwd) {
  try { return JSON.parse(fs.readFileSync(statePath(cwd), 'utf8')); } catch { return {}; }
}
function writeState(cwd, patch) {
  const next = { ...readState(cwd), ...patch };
  const p = statePath(cwd);
  fs.writeFileSync(p + '.tmp', JSON.stringify(next, null, 2));
  fs.renameSync(p + '.tmp', p);
  return next;
}
function log(cwd, line) {
  try { fs.appendFileSync(logPath(cwd), `${new Date().toISOString()} ${line}\n`); } catch { /* ignore */ }
}

function identity(cwd) {
  const cfg = (k) => git(['config', '--get', k], { cwd, allowFail: true }).out;
  return {
    computer: env.OJ_LOCK_COMPUTER || cfg('oj.computerName') || os.hostname(),
    developer: env.OJ_LOCK_DEVELOPER || cfg('oj.developerName') || cfg('user.name') || os.userInfo().username,
  };
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// ---------- lock logic ----------

const isActive = (rec) => rec && rec.status === 'active';
const isExpired = (rec, nowMs) => isActive(rec) && Date.parse(rec.expiresAt) <= nowMs;
const isMine = (rec, st) => isActive(rec) && !!st.sessionId && rec.sessionId === st.sessionId && rec.generation === st.generation;

function workingInfo(cwd) {
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, allowFail: true }).out || 'unknown',
    commit: git(['rev-parse', '--short', 'HEAD'], { cwd, allowFail: true }).out || 'unknown',
  };
}

function describe(rec, nowMs) {
  if (!rec) return 'No development lock exists yet (free).';
  if (rec.status === 'released') return `Free — released by ${rec.computer} (${rec.developer}) at ${rec.releasedAt}.`;
  if (!isActive(rec)) return `Lock record has unexpected status '${rec.status}'.`;
  const ago = Math.round((nowMs - Date.parse(rec.lastHeartbeat)) / 60_000);
  const state = isExpired(rec, nowMs)
    ? `EXPIRED — no heartbeat for ${ago} min; the session appears inactive but may still be running`
    : `active (last heartbeat ${ago} min ago)`;
  return [
    `Computer:       ${rec.computer}`,
    `Developer:      ${rec.developer}`,
    `Current task:   ${rec.currentTask || '—'}`,
    `Branch/commit:  ${rec.branch} @ ${rec.commit}`,
    `Started:        ${rec.startedAt}`,
    `Last heartbeat: ${rec.lastHeartbeat}`,
    `Lock expires:   ${rec.expiresAt}`,
    `Generation:     ${rec.generation}   Session: ${rec.sessionId}`,
    `State:          ${state}`,
  ].join('\n');
}

function lockedBanner(rec, nowMs) {
  return `\n==== OFFLINEJEOPARDY DEVELOPMENT LOCKED ====\nAnother development session holds the lock.\n${describe(rec, nowMs)}\n` +
    `Development changes must not begin until the lock is released or expires.\n` +
    `Read-only work (docs, history, code review) is fine.\n` +
    (isExpired(rec, nowMs)
      ? `The lock has expired. If you are sure that session has stopped, run:  npm run dev:lock:recover -- --confirm\n`
      : `Check again later:  npm run dev:lock:status\n`) +
    '===========================================\n';
}

function newRecord(base, { cwd, now, generation, sessionId, task, startedAt }) {
  const id = identity(cwd);
  return {
    project: 'OfflineJeopardy',
    schema: 1,
    status: 'active',
    sessionId,
    generation,
    computer: id.computer,
    developer: id.developer,
    ...workingInfo(cwd),
    startedAt: startedAt ?? iso(now.ms),
    lastHeartbeat: iso(now.ms),
    expiresAt: iso(now.ms + TTL_MS),
    clock: now.source,
    heartbeatSeconds: HEARTBEAT_MS / 1000,
    ttlSeconds: TTL_MS / 1000,
    currentTask: task ?? base?.currentTask ?? '',
  };
}

async function claim(cwd, remote, { task, recoveredFrom, keepSession }) {
  const now = await serverNow(cwd);
  const st = readState(cwd);
  const generation = keepSession ? remote.record.generation : (remote.record?.generation ?? 0) + 1;
  const sessionId = keepSession ? st.sessionId : randomUUID();
  const rec = newRecord(keepSession ? remote.record : null, {
    cwd, now, generation, sessionId, task, startedAt: keepSession ? remote.record.startedAt : undefined,
  });
  if (recoveredFrom) rec.recoveredFrom = recoveredFrom;
  const res = writeRemote(rec, remote.sha, `lock: ${rec.computer} acquires (generation ${generation})`, cwd);
  writeState(cwd, {
    status: 'held', sessionId, generation, lockSha: res.sha, confirmedAt: Date.now(), lastActivity: Date.now(),
    computer: rec.computer, task: rec.currentTask, message: '',
  });
  log(cwd, `acquired generation ${generation} session ${sessionId}`);
  return rec;
}

/** One heartbeat: renews our lock, or marks the local state lost when someone else owns it. */
async function renewOnce(cwd) {
  const st = readState(cwd);
  if (st.status !== 'held') return { ok: false, reason: 'This clone does not hold the lock.' };
  const remote = readRemote(cwd);
  if (!isMine(remote.record, st)) {
    writeState(cwd, { status: 'lost', message: 'Another session now owns the development lock.' });
    log(cwd, 'heartbeat: ownership lost');
    return { ok: false, lost: true, reason: 'Ownership lost: another session owns the lock now.', record: remote.record };
  }
  const now = await serverNow(cwd);
  const rec = { ...remote.record, ...workingInfo(cwd), lastHeartbeat: iso(now.ms), expiresAt: iso(now.ms + TTL_MS), clock: now.source, currentTask: st.task ?? remote.record.currentTask };
  try {
    const res = writeRemote(rec, remote.sha, `lock: heartbeat ${rec.computer}`, cwd);
    writeState(cwd, { lockSha: res.sha, confirmedAt: Date.now() });
    return { ok: true, record: rec };
  } catch (e) {
    if (e.kind === 'conflict') return renewOnce(cwd); // the ref moved: re-read and decide again
    throw e;
  }
}

function hooksInstall(cwd) {
  if (env.OJ_LOCK_NO_HOOKS) return;
  const dir = path.join(REPO_OF_SCRIPT, '.githooks');
  if (!fs.existsSync(dir)) return;
  const rel = path.relative(git(['rev-parse', '--show-toplevel'], { cwd }).out, dir) || '.githooks';
  git(['config', 'core.hooksPath', rel.split(path.sep).join('/')], { cwd });
}

function startHeartbeat(cwd) {
  const st = readState(cwd);
  if (st.heartbeatPid && pidAlive(st.heartbeatPid)) return st.heartbeatPid;
  const child = spawn(process.execPath, [SCRIPT, 'heartbeat'], {
    cwd, detached: true, stdio: 'ignore', windowsHide: true, env,
  });
  child.unref();
  writeState(cwd, { heartbeatPid: child.pid, heartbeatStartedAt: Date.now() });
  return child.pid;
}

function stopHeartbeat(cwd) {
  const st = readState(cwd);
  if (st.heartbeatPid && st.heartbeatPid !== process.pid && pidAlive(st.heartbeatPid)) {
    try { process.kill(st.heartbeatPid); } catch { /* already gone */ }
  }
  writeState(cwd, { heartbeatPid: null });
}

// ---------- commands ----------

async function cmdStatus(cwd, { json }) {
  const remote = readRemote(cwd);
  const now = await serverNow(cwd);
  const st = readState(cwd);
  if (json) {
    console.log(JSON.stringify({ remote: remote.record, sha: remote.sha, mine: isMine(remote.record, st), expired: isExpired(remote.record, now.ms), now: iso(now.ms) }, null, 2));
    return EXIT_OK;
  }
  console.log(`Development lock (${REMOTE} ${LOCK_REF}) at ${iso(now.ms)} [${now.source}]`);
  console.log(describe(remote.record, now.ms));
  if (isMine(remote.record, st)) {
    console.log(`\nThis clone OWNS the lock. Heartbeat process: ${pidAlive(st.heartbeatPid) ? `running (pid ${st.heartbeatPid})` : 'NOT running — run npm run dev:lock:acquire'}`);
  } else if (isActive(remote.record) && !isExpired(remote.record, now.ms)) {
    console.log('\nAnother session owns the lock — do not modify the project.');
  } else if (st.status === 'held') {
    console.log('\nThis clone thinks it holds the lock but the remote disagrees — run npm run dev:lock:acquire.');
  }
  return EXIT_OK;
}

async function cmdAcquire(cwd, { task, heartbeat }) {
  const remote = readRemote(cwd);
  const now = await serverNow(cwd);
  const st = readState(cwd);
  const rec = remote.record;
  if (isActive(rec) && rec.sessionId === st.sessionId && rec.generation === st.generation) {
    // Our own session (possibly expired while idle — nobody else wrote, or the ref would have moved).
    await claim(cwd, remote, { task, keepSession: true });
    console.log(`Lock re-confirmed for this clone (generation ${rec.generation}).`);
  } else if (isActive(rec)) {
    console.log(lockedBanner(rec, now.ms));
    return EXIT_REFUSED;
  } else if (rec && rec.status !== 'released') {
    console.log(`The lock record is unreadable (status '${rec.status}'). Inspect branch ${LOCK_REF} on ${REMOTE}; recover with npm run dev:lock:recover -- --confirm.`);
    return EXIT_REFUSED;
  } else {
    try {
      const mine = await claim(cwd, remote, { task });
      console.log(`Development lock ACQUIRED by ${mine.computer} (${mine.developer}), generation ${mine.generation}.`);
    } catch (e) {
      if (e.kind !== 'conflict') throw e;
      const winner = readRemote(cwd);
      console.log('Lost the race for the lock: another computer acquired it at the same moment.');
      console.log(lockedBanner(winner.record, (await serverNow(cwd)).ms));
      return EXIT_REFUSED;
    }
  }
  hooksInstall(cwd);
  if (heartbeat) console.log(`Heartbeat running (pid ${startHeartbeat(cwd)}), every ${HEARTBEAT_MS / 60_000} min; the lock expires ${TTL_MS / 60_000} min after the last one.`);
  return EXIT_OK;
}

async function cmdRelease(cwd, { allowUnpushed }) {
  const st = readState(cwd);
  if (!isMine(readRemote(cwd).record, st)) {
    console.log('Refused: this clone does not own the development lock, so it cannot release it.');
    console.log(describe(readRemote(cwd).record, (await serverNow(cwd)).ms));
    return EXIT_REFUSED;
  }
  const unpushed = git(['branch', '-r', '--contains', 'HEAD'], { cwd, allowFail: true }).out === '';
  if (unpushed && !allowUnpushed) {
    console.log('Refused: HEAD is not on any remote branch. Push your work first (or pass --allow-unpushed).');
    return EXIT_REFUSED;
  }
  // Stop the heartbeat first; one of its pushes may still land meanwhile, so the release is a
  // compare-and-swap that re-reads (and re-checks ownership) when the lock moved under it.
  stopHeartbeat(cwd);
  let rec;
  for (let attempt = 0; ; attempt++) {
    const remote = readRemote(cwd);
    if (!isMine(remote.record, st)) {
      console.log('Refused: the lock changed hands while releasing.');
      return EXIT_REFUSED;
    }
    const now = await serverNow(cwd);
    rec = { ...remote.record, ...workingInfo(cwd), status: 'released', releasedAt: iso(now.ms), clock: now.source };
    try {
      writeRemote(rec, remote.sha, `lock: ${rec.computer} releases`, cwd);
      break;
    } catch (e) {
      if (e.kind !== 'conflict' || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  writeState(cwd, { status: 'released', confirmedAt: 0, message: 'Released.' });
  log(cwd, 'released');
  console.log(`Development lock RELEASED and verified on ${REMOTE} (${rec.releasedAt}).`);
  return EXIT_OK;
}

async function cmdRecover(cwd, { confirm, task, heartbeat }) {
  const remote = readRemote(cwd);
  const now = await serverNow(cwd);
  const rec = remote.record;
  if (!isActive(rec) && rec?.status !== 'corrupt') return cmdAcquire(cwd, { task, heartbeat });
  if (isActive(rec) && !isExpired(rec, now.ms)) {
    console.log(lockedBanner(rec, now.ms));
    console.log('Refused: the lock is still active. An active lock is never taken over; wait until it is released or expires.');
    return EXIT_REFUSED;
  }
  const st = readState(cwd);
  const me = identity(cwd);
  const sameComputerDead = rec && rec.computer === me.computer && st.sessionId === rec.sessionId && !pidAlive(st.heartbeatPid);
  if (!confirm && !sameComputerDead) {
    console.log(lockedBanner(rec, now.ms));
    console.log('Recovery needs a human decision: an expired heartbeat does not prove the other session has stopped.');
    console.log('Check the other computer (Claude Code closed / not working on OfflineJeopardy), then run:');
    console.log('  npm run dev:lock:recover -- --confirm');
    return EXIT_REFUSED;
  }
  try {
    const mine = await claim(cwd, remote, {
      task,
      recoveredFrom: rec ? { sessionId: rec.sessionId, computer: rec.computer, generation: rec.generation, lastHeartbeat: rec.lastHeartbeat } : { status: 'corrupt' },
    });
    console.log(`Development lock RECOVERED by ${mine.computer}, generation ${mine.generation} (previous: ${rec?.computer ?? 'unreadable'}).`);
  } catch (e) {
    if (e.kind !== 'conflict') throw e;
    console.log('Recovery aborted: the lock changed while recovering (the previous owner may still be alive). Run status again.');
    return EXIT_REFUSED;
  }
  hooksInstall(cwd);
  if (heartbeat) console.log(`Heartbeat running (pid ${startHeartbeat(cwd)}).`);
  return EXIT_OK;
}

/** Fencing check for git hooks and before milestones/commits/pushes/releases. */
async function cmdCheck(cwd, { quiet }) {
  const st = readState(cwd);
  let remote;
  try {
    remote = readRemote(cwd);
  } catch (e) {
    console.error(`\nOFFLINEJEOPARDY DEVELOPMENT LOCK: cannot verify ownership (${e.message.split('\n')[0]}).\nFailing closed — no commits or pushes until GitHub is reachable. Local files are untouched.\n`);
    return EXIT_UNVERIFIED;
  }
  const now = await serverNow(cwd);
  if (isMine(remote.record, st) && !isExpired(remote.record, now.ms)) {
    writeState(cwd, { confirmedAt: Date.now() });
    if (!quiet) console.log(`OK: this clone owns the development lock (generation ${st.generation}).`);
    return EXIT_OK;
  }
  if (isMine(remote.record, st)) {
    console.error('\nOFFLINEJEOPARDY DEVELOPMENT LOCK: your lock has EXPIRED (no heartbeat). Run npm run dev:lock:acquire to renew it, then retry.\n');
    return EXIT_REFUSED;
  }
  if (st.status === 'held') writeState(cwd, { status: 'lost', message: 'Another session now owns the development lock.' });
  console.error(isActive(remote.record) ? lockedBanner(remote.record, now.ms) : '\nOFFLINEJEOPARDY DEVELOPMENT LOCK: this clone does not hold the lock. Run npm run dev:lock:acquire first.\n');
  return EXIT_REFUSED;
}

async function cmdHeartbeat(cwd) {
  const me = process.pid;
  const first = readState(cwd);
  if (first.heartbeatPid && first.heartbeatPid !== me && pidAlive(first.heartbeatPid)) return EXIT_OK; // one per clone
  writeState(cwd, { heartbeatPid: me });
  log(cwd, `heartbeat started pid ${me}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, HEARTBEAT_MS));
    const st = readState(cwd);
    if (st.heartbeatPid !== me || st.status !== 'held') { log(cwd, `heartbeat ${me} exits (state ${st.status})`); return EXIT_OK; }
    if (Date.now() - (st.lastActivity || 0) > IDLE_MS) {
      writeState(cwd, { heartbeatPid: null, message: `Heartbeat stopped after ${IDLE_MS / 60_000} min without Claude Code activity; the lock will expire.` });
      log(cwd, 'heartbeat stopped: idle');
      return EXIT_OK;
    }
    try {
      const r = await renewOnce(cwd);
      if (!r.ok) { log(cwd, `heartbeat exits: ${r.reason}`); return EXIT_OK; }
    } catch (e) {
      log(cwd, `heartbeat failed (${e.kind}): ${e.message.split('\n')[0]}`); // retry next tick; confirmedAt ages → guard fails closed
    }
  }
}

function insideRepo(file, root) {
  if (!file) return true;
  const rel = path.relative(path.resolve(root).toLowerCase(), path.resolve(root, file).toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Claude Code PreToolUse hook for edit tools: offline check of this clone's confirmed ownership. */
function cmdGuard(root) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no input */ }
  const file = input.tool_input?.file_path || input.tool_input?.notebook_path;
  if (!insideRepo(file, root)) return EXIT_OK; // scratchpad, memory, other projects
  let st;
  try { st = readState(root); } catch { st = {}; }
  const fresh = st.status === 'held' && Date.now() - (st.confirmedAt || 0) < TTL_MS;
  if (fresh) { writeState(root, { lastActivity: Date.now() }); return EXIT_OK; }
  const why = st.status === 'lost' ? 'ownership was LOST (another session owns the lock)'
    : st.status === 'held' ? `ownership has not been confirmed for over ${TTL_MS / 60_000} min (heartbeat stopped or GitHub unreachable)`
    : 'this clone does not hold the lock';
  process.stderr.write(`OFFLINEJEOPARDY DEVELOPMENT LOCK: editing project files is blocked — ${why}.\n` +
    'Run `npm run dev:lock:status`, then `npm run dev:lock:acquire` (never take over an active lock). See DEVELOPMENT_LOCK.md.\n');
  return 2; // Claude Code: block the tool call and show stderr
}

function cmdActivity(root) {
  try { fs.readFileSync(0, 'utf8'); } catch { /* ignore */ }
  try { if (readState(root).status === 'held') writeState(root, { lastActivity: Date.now() }); } catch { /* ignore */ }
  return EXIT_OK;
}

async function cmdSessionStart(root) {
  try {
    const remote = readRemote(root);
    const now = await serverNow(root);
    const st = readState(root);
    if (isMine(remote.record, st)) console.log(`[dev-lock] This clone owns the OfflineJeopardy development lock (generation ${st.generation}). If the heartbeat stopped, run npm run dev:lock:acquire.`);
    else if (isActive(remote.record) && !isExpired(remote.record, now.ms)) console.log(lockedBanner(remote.record, now.ms));
    else console.log(`[dev-lock] ${describe(remote.record, now.ms).split('\n')[0]} Acquire it before changing anything: npm run dev:lock:acquire -- --task "<task>"`);
  } catch (e) {
    console.log(`[dev-lock] Cannot reach GitHub to check the development lock (${e.message.split('\n')[0]}). Fail closed: read-only work only until it can be verified.`);
  }
  return EXIT_OK;
}

async function cmdTask(cwd, text) {
  writeState(cwd, { task: text });
  const r = await renewOnce(cwd);
  console.log(r.ok ? `Current task set: ${text}` : r.reason);
  return r.ok ? EXIT_OK : EXIT_REFUSED;
}

// ---------- main ----------

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') opts.task = argv[++i];
    else if (a.startsWith('--task=')) opts.task = a.slice(7);
    else if (a === '--confirm') opts.confirm = true;
    else if (a === '--no-heartbeat') opts.heartbeat = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--allow-unpushed') opts.allowUnpushed = true;
    else opts._.push(a);
  }
  return { heartbeat: true, ...opts };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  const cwd = process.cwd();
  const hookRoot = env.CLAUDE_PROJECT_DIR || cwd;
  try {
    switch (cmd) {
      case 'status': return await cmdStatus(cwd, opts);
      case 'acquire': return await cmdAcquire(cwd, opts);
      case 'release': return await cmdRelease(cwd, opts);
      case 'recover': return await cmdRecover(cwd, opts);
      case 'check': return await cmdCheck(cwd, opts);
      case 'renew': {
        const r = await renewOnce(cwd);
        console.log(r.ok ? `Heartbeat sent; lock expires ${r.record.expiresAt}.` : r.reason);
        return r.ok ? EXIT_OK : EXIT_REFUSED;
      }
      case 'heartbeat': return await cmdHeartbeat(cwd);
      case 'stop-heartbeat': stopHeartbeat(cwd); console.log('Heartbeat stopped (the lock stays until released or expired).'); return EXIT_OK;
      case 'task': return await cmdTask(cwd, opts._.join(' '));
      case 'guard': return cmdGuard(hookRoot);
      case 'activity': return cmdActivity(hookRoot);
      case 'session-start': return await cmdSessionStart(hookRoot);
      default:
        console.log('Usage: node scripts/dev-lock.mjs status|acquire [--task T]|release|recover [--confirm]|check|renew|task <text>|stop-heartbeat');
        return cmd ? EXIT_REFUSED : EXIT_OK;
    }
  } catch (e) {
    if (e instanceof LockError && e.kind === 'network') {
      console.error(`\nOFFLINEJEOPARDY DEVELOPMENT LOCK: GitHub cannot be reached, so ownership cannot be verified.\n${e.message}\n` +
        'Failing closed: do not start shared development or push. Local work is untouched; read-only work is fine.\n');
      return EXIT_UNVERIFIED;
    }
    console.error(`dev-lock: ${e.message}`);
    return EXIT_UNVERIFIED;
  }
}

main().then((code) => { process.exitCode = code; });
