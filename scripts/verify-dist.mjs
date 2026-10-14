// Verifies the Windows build in release/ before it is published:
//  1. installer, portable exe and unpacked app exist for the package.json version
//  2. app.asar contains the bundled web app + Electron main, and no databases, logs or secrets
//  3. native image library (sharp) is unpacked next to the archive; the user guide is shipped
//  4. the unpacked app starts headlessly (--smoke-test) and its embedded server works
//  5. SHA256SUMS.txt is written for the artifacts
// Usage: node scripts/verify-dist.mjs [--skip-smoke]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import asar from '@electron/asar';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const v = pkg.version;
const rel = path.join(root, 'release');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const mb = (f) => `${(fs.statSync(f).size / 1024 / 1024).toFixed(1)} MB`;

const setup = path.join(rel, `OfflineJeopardy-Setup-${v}.exe`);
const portable = path.join(rel, `OfflineJeopardy-Portable-${v}.exe`);
const unpacked = path.join(rel, 'win-unpacked');
const exe = path.join(unpacked, 'OfflineJeopardy.exe');
const resources = path.join(unpacked, 'resources');
const archive = path.join(resources, 'app.asar');

for (const [name, f, min] of [
  ['Installer', setup, 50],
  ['Portable', portable, 50],
  ['Unpacked app', exe, 50],
]) {
  const ok = fs.existsSync(f) && fs.statSync(f).size > min * 1024 * 1024;
  check(`${name} exists (${path.basename(f)})`, ok, fs.existsSync(f) ? mb(f) : 'missing');
}

if (fs.existsSync(archive)) {
  const files = asar.listPackage(archive).map((f) => f.replace(/\\/g, '/'));
  const has = (p) => files.includes(p);
  check('app.asar has the web app', has('/dist/web/index.html'));
  check('app.asar has the Electron main + preload', has('/dist/electron/main.cjs') && has('/dist/electron/preload.cjs'));
  check('app.asar has package.json', has('/package.json'));
  check('app.asar has the runtime dependencies (Fastify, AI SDK)', has('/node_modules/fastify/package.json') && has('/node_modules/@anthropic-ai/sdk/package.json'));
  const bad = files.filter((f) => /\.(db|db-wal|db-shm|log|env|pem|key)$/i.test(f) || /^\/(data|test-results|release|\.git|secrets)\//.test(f) || /OfflineJeopardyData/.test(f));
  check('app.asar has no databases, logs, keys or test data', bad.length === 0, bad.slice(0, 5).join(', '));
  check('app.asar has no source maps', !files.some((f) => f.startsWith('/dist/') && f.endsWith('.map')));
  const inner = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  check('packaged version matches package.json', inner.version === v, inner.version);
} else check('app.asar exists', false, 'missing');

check('sharp is unpacked (native module)', fs.existsSync(path.join(resources, 'app.asar.unpacked', 'node_modules', 'sharp')));
const img = path.join(resources, 'app.asar.unpacked', 'node_modules', '@img');
check('sharp Windows binary is unpacked', fs.existsSync(img) && fs.readdirSync(img).some((d) => d.startsWith('sharp-win32')), fs.existsSync(img) ? fs.readdirSync(img).join(', ') : 'missing');
check('User guide is shipped', fs.existsSync(path.join(resources, 'USER_GUIDE.md')));
// The Jeopardy!/Buzzinga recordings (new_sfx/) belong to the owner: a local build may carry them for
// personal use, a public (CI) build must not (R4-1, KNOWN_ISSUES K28).
const packDir = path.join(resources, 'soundpacks', 'buzzinga');
const packFiles = fs.existsSync(packDir) ? fs.readdirSync(packDir) : [];
if (process.env.CI) check('public build has no personal sound files', packFiles.length === 0, packFiles.slice(0, 3).join(', '));
else console.log(`  info  personal Jeopardy!/Buzzinga sounds in this local build: ${packFiles.length ? `${packFiles.length} files (personal use only — do not publish)` : 'none'}`);

function smoke(label, file) {
  const report = path.join(os.tmpdir(), `oj-smoke-${process.pid}-${label.length}.json`);
  fs.rmSync(report, { force: true });
  const run = spawnSync(file, [`--smoke-test=${report}`], { timeout: 180_000, windowsHide: true });
  let r = null;
  try {
    r = JSON.parse(fs.readFileSync(report, 'utf8'));
  } catch {
    /* no report */
  }
  check(`${label} starts and its server works (smoke test)`, run.status === 0 && r?.ok === true, r ? JSON.stringify({ version: r.serverVersion, boards: r.sampleBoards, image: r.imagePipeline, web: r.boardPage, error: r.error?.split('\n')[0] }) : `exit ${run.status}${run.error ? ` ${run.error.message}` : ''}`);
  fs.rmSync(report, { force: true });
}
if (!process.argv.includes('--skip-smoke')) {
  if (fs.existsSync(exe)) smoke('Unpacked app', exe);
  if (fs.existsSync(portable)) smoke('Portable exe', portable);
}

const sums = [setup, portable].filter((f) => fs.existsSync(f)).map((f) => `${createHash('sha256').update(fs.readFileSync(f)).digest('hex')}  ${path.basename(f)}`);
if (sums.length) fs.writeFileSync(path.join(rel, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(rel, 'verify-report.json'), JSON.stringify({ version: v, at: new Date().toISOString(), host: `${os.platform()} ${os.release()}`, results }, null, 2));
console.log(failed.length ? `\n${failed.length} check(s) failed.` : `\nAll ${results.length} checks passed for v${v}.`);
process.exit(failed.length ? 1 : 0);
