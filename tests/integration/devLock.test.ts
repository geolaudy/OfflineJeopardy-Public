// Development lock (scripts/dev-lock.mjs): runs the real CLI against a throw-away bare repository,
// never against the project's GitHub lock.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve('scripts/dev-lock.mjs');
const HOOKS = path.resolve('.githooks');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-devlock-'));
let n = 0;

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}

interface Clone { dir: string; computer: string }
interface Run { code: number; out: string }

function setup(): { remote: string; a: Clone; b: Clone } {
  const base = path.join(root, `r${++n}`);
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(base, { recursive: true });
  git(base, 'init', '--bare', '-b', 'main', remote);
  const clone = (name: string, computer: string): Clone => {
    const dir = path.join(base, name);
    git(base, 'clone', '-q', remote, dir);
    git(dir, 'config', 'user.name', `dev-${name}`);
    git(dir, 'config', 'user.email', `${name}@example.invalid`);
    git(dir, 'config', 'commit.gpgsign', 'false');
    return { dir, computer };
  };
  const a = clone('a', 'PC-A');
  fs.writeFileSync(path.join(a.dir, 'README.md'), 'hello\n');
  git(a.dir, 'add', '.');
  git(a.dir, 'commit', '-qm', 'init');
  git(a.dir, 'push', '-q', 'origin', 'HEAD:main');
  const b = clone('b', 'PC-B');
  return { remote, a, b };
}

const lockEnv = (c: Clone, extra: Record<string, string> = {}) => ({
  ...process.env,
  OJ_LOCK_TIME_URL: 'local',
  OJ_LOCK_NO_HOOKS: '1',
  OJ_LOCK_COMPUTER: c.computer,
  OJ_LOCK_DEVELOPER: `dev-${c.computer}`,
  CLAUDE_PROJECT_DIR: c.dir,
  ...extra,
});

function lock(c: Clone, args: string[], extra: Record<string, string> = {}, input?: string): Run {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: c.dir, env: lockEnv(c, extra), encoding: 'utf8', input });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

function lockAsync(c: Clone, args: string[]): Promise<Run> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { cwd: c.dir, env: lockEnv(c) });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code: code ?? -1, out }));
  });
}

function remoteRecord(c: Clone) {
  const r = lock(c, ['status', '--json']);
  expect(r.code).toBe(0);
  return JSON.parse(r.out);
}

const localState = (c: Clone) => JSON.parse(fs.readFileSync(path.join(c.dir, '.git', 'oj-dev-lock.json'), 'utf8'));
const LATER = { OJ_LOCK_TIME_OFFSET_MS: String(20 * 60_000) }; // 20 minutes later: past the 15-minute expiry

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('development lock', { timeout: 60_000 }, () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => { env = setup(); });

  it('acquires a free lock, keeps it off main, and rejects a second computer', () => {
    const { a, b } = env;
    const got = lock(a, ['acquire', '--no-heartbeat', '--task', 'Host redesign']);
    expect(got.code, got.out).toBe(0);
    const s = remoteRecord(a);
    expect(s.mine).toBe(true);
    expect(s.remote).toMatchObject({ status: 'active', computer: 'PC-A', generation: 1, currentTask: 'Host redesign', branch: 'main' });
    // main is untouched by lock operations
    expect(git(a.dir, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0]).toBe(git(a.dir, 'rev-parse', 'HEAD'));

    const denied = lock(b, ['acquire', '--no-heartbeat']);
    expect(denied.code).toBe(1);
    expect(denied.out).toContain('OFFLINEJEOPARDY DEVELOPMENT LOCKED');
    expect(denied.out).toContain('PC-A');
    expect(denied.out).toContain('Host redesign');
    expect(lock(b, ['check']).code).toBe(1);
    expect(lock(a, ['check']).code).toBe(0);
  });

  it('lets exactly one of two simultaneous acquisitions win', async () => {
    const { a, b } = env;
    for (let round = 0; round < 3; round++) {
      const [ra, rb] = await Promise.all([lockAsync(a, ['acquire', '--no-heartbeat']), lockAsync(b, ['acquire', '--no-heartbeat'])]);
      const winners = [ra, rb].filter((r) => r.code === 0);
      expect(winners.length, `${ra.out}\n---\n${rb.out}`).toBe(1);
      const winner = ra.code === 0 ? a : b;
      const loser = ra.code === 0 ? b : a;
      expect((ra.code === 0 ? rb : ra).out).toContain('DEVELOPMENT LOCKED');
      expect(remoteRecord(winner).remote.computer).toBe(winner.computer);
      expect(lock(loser, ['check']).code).toBe(1);
      expect(lock(winner, ['release', '--allow-unpushed']).code).toBe(0);
    }
  });

  it('heartbeats move the expiry forward; an expired lock is detected and not taken silently', () => {
    const { a, b } = env;
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    const before = remoteRecord(a).remote;
    const beat = lock(a, ['renew'], { OJ_LOCK_TIME_OFFSET_MS: '60000' });
    expect(beat.code, beat.out).toBe(0);
    const after = remoteRecord(a).remote;
    expect(Date.parse(after.expiresAt)).toBeGreaterThan(Date.parse(before.expiresAt));
    expect(after.generation).toBe(before.generation);

    // 20 minutes without a heartbeat (simulated crash): visible as expired, but acquire refuses
    const st = lock(b, ['status'], LATER);
    expect(st.out).toContain('EXPIRED');
    const refused = lock(b, ['acquire', '--no-heartbeat'], LATER);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('--confirm');
    // recovery without a human confirmation is refused for another computer
    expect(lock(b, ['recover', '--no-heartbeat'], LATER).code).toBe(1);
    // an active (unexpired) lock can never be recovered, even with --confirm
    expect(lock(b, ['recover', '--confirm', '--no-heartbeat']).code).toBe(1);
  });

  it('recovers an expired lock with confirmation; the old session is fenced out', () => {
    const { a, b } = env;
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    const rec = lock(b, ['recover', '--confirm', '--no-heartbeat'], LATER);
    expect(rec.code, rec.out).toBe(0);
    const s = remoteRecord(b).remote;
    expect(s).toMatchObject({ computer: 'PC-B', generation: 2 });
    expect(s.recoveredFrom).toMatchObject({ computer: 'PC-A', generation: 1 });

    // A comes back: its heartbeat notices the loss, its checks fail, and it cannot release B's lock
    const beat = lock(a, ['renew']);
    expect(beat.code).toBe(1);
    expect(beat.out).toContain('Ownership lost');
    expect(localState(a).status).toBe('lost');
    expect(lock(a, ['check']).code).toBe(1);
    expect(lock(a, ['release', '--allow-unpushed']).code).toBe(1);
    expect(remoteRecord(a).remote.computer).toBe('PC-B');
  });

  it('recovers its own crashed session on the same computer without confirmation', () => {
    const { remote, a } = env;
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    // same computer, heartbeat process dead (none was started), lock expired
    const again = lock(a, ['recover', '--no-heartbeat'], LATER);
    expect(again.code, again.out).toBe(0);
    expect(remoteRecord(a).remote.generation).toBe(2);
    expect(remote).toBeTruthy();
  });

  it('only the owner releases; a released lock can be acquired by the next computer', () => {
    const { a, b } = env;
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    const stolen = lock(b, ['release', '--allow-unpushed']);
    expect(stolen.code).toBe(1);
    expect(stolen.out).toContain('does not own');
    expect(remoteRecord(b).remote.status).toBe('active');

    expect(lock(a, ['release']).code).toBe(0); // HEAD is pushed (main), so no flag needed
    expect(remoteRecord(a).remote.status).toBe('released');
    const next = lock(b, ['acquire', '--no-heartbeat']);
    expect(next.code, next.out).toBe(0);
    expect(remoteRecord(b).remote).toMatchObject({ computer: 'PC-B', generation: 2 });
  });

  it('refuses to release while HEAD is unpushed', () => {
    const { a } = env;
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    fs.writeFileSync(path.join(a.dir, 'x.txt'), 'x');
    git(a.dir, 'add', '.');
    git(a.dir, 'commit', '-qm', 'local only');
    const r = lock(a, ['release']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Push your work first');
  });

  it('fails closed when GitHub (the remote) cannot be reached', () => {
    const { a } = env;
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    git(a.dir, 'remote', 'set-url', 'origin', path.join(root, 'does-not-exist.git'));
    for (const cmd of [['status'], ['acquire', '--no-heartbeat'], ['check'], ['renew']]) {
      const r = lock(a, cmd);
      expect(r.code, cmd.join(' ')).toBe(2);
      expect(r.out).toContain('cannot');
    }
  });

  it('works across branches: the lock is per project, not per branch', () => {
    const { a, b } = env;
    git(a.dir, 'checkout', '-qb', 'feature/host');
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    expect(remoteRecord(a).remote.branch).toBe('feature/host');
    git(b.dir, 'checkout', '-qb', 'other');
    expect(lock(b, ['acquire', '--no-heartbeat']).code).toBe(1);
  });

  it('blocks a stale session from committing and pushing through the git hooks', () => {
    const { a, b } = env;
    for (const c of [a, b]) git(c.dir, 'config', 'core.hooksPath', HOOKS);
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    fs.writeFileSync(path.join(a.dir, 'a.txt'), 'a');
    git(a.dir, 'add', '.');
    const env1 = lockEnv(a);
    execFileSync('git', ['commit', '-qm', 'owner commit'], { cwd: a.dir, env: env1 });
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: a.dir, env: env1 });

    // B takes over after expiry; A's next commit and push are refused
    expect(lock(b, ['recover', '--confirm', '--no-heartbeat'], LATER).code).toBe(0);
    fs.writeFileSync(path.join(a.dir, 'a2.txt'), 'a2');
    git(a.dir, 'add', '.');
    const commit = spawnSync('git', ['commit', '-qm', 'stale commit'], { cwd: a.dir, env: env1, encoding: 'utf8' });
    expect(commit.status).not.toBe(0);
    expect(commit.stderr).toContain('DEVELOPMENT LOCK');
    const push = spawnSync('git', ['push', 'origin', 'HEAD:main'], { cwd: a.dir, env: env1, encoding: 'utf8' });
    expect(push.status).not.toBe(0);
    expect(git(a.dir, 'ls-remote', 'origin', 'refs/heads/main').split('\t')[0]).toBe(git(a.dir, 'rev-parse', 'HEAD'));
  });

  it('the Claude Code edit guard allows the owner, blocks others, and ignores files outside the project', () => {
    const { a, b } = env;
    const input = (file: string) => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } });
    expect(lock(b, ['guard'], {}, input(path.join(b.dir, 'src.ts'))).code).toBe(2);
    expect(lock(b, ['guard'], {}, input(path.join(os.tmpdir(), 'scratch.txt'))).code).toBe(0);
    expect(lock(a, ['acquire', '--no-heartbeat']).code).toBe(0);
    expect(lock(a, ['guard'], {}, input(path.join(a.dir, 'src.ts'))).code).toBe(0);
    // ownership lost → blocked
    expect(lock(b, ['recover', '--confirm', '--no-heartbeat'], LATER).code).toBe(0);
    lock(a, ['renew']);
    const blocked = lock(a, ['guard'], {}, input(path.join(a.dir, 'src.ts')));
    expect(blocked.code).toBe(2);
    expect(blocked.out).toContain('LOST');
  });

  it('the background heartbeat renews the lock on its own', async () => {
    const { a } = env;
    const fast = { OJ_LOCK_HEARTBEAT_MS: '400' };
    const got = lock(a, ['acquire'], fast);
    expect(got.code, got.out).toBe(0);
    const first = remoteRecord(a).remote.lastHeartbeat;
    try {
      let later = first;
      for (let i = 0; i < 40 && later === first; i++) {
        await new Promise((r) => setTimeout(r, 250));
        later = remoteRecord(a).remote.lastHeartbeat;
      }
      expect(Date.parse(later)).toBeGreaterThan(Date.parse(first));
    } finally {
      const r = lock(a, ['release', '--allow-unpushed']);
      expect(r.code, r.out).toBe(0);
    }
    expect(localState(a).heartbeatPid).toBeNull();
  });
});
