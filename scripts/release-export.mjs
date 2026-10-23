// Prepares a stable release of OfflineJeopardy for `main` (BRANCH_WORKFLOW.md) — never pushes.
//
//   node scripts/release-export.mjs --source <development commit> --version 1.2.0 [--base origin/main]
//                                   [--dir <worktree folder>] [--trailer "Co-Authored-By: …"]
//   node scripts/release-export.mjs --list        # the development-only paths left out of main
//
// main's tree = the approved development commit's tree, minus the development-only paths below, with
// the dev:lock:* npm scripts removed from package.json. The script creates the branch
// release/v<version> from --base in a separate git worktree (default: next to this checkout), makes
// that one snapshot commit (single parent: the previous main; trailer "Release-Source: <commit>"),
// checks the result and prints the next steps. It does not touch this checkout, main or any remote.
// Nothing is merged: development and main share history, but main only ever receives snapshot
// commits, so files that exist only on development can never leak back into main.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Development-only paths (files or folders, repository-relative). Keep in sync with BRANCH_WORKFLOW.md. */
export const DEVELOPMENT_ONLY = [
  '.claude', // Claude Code agents, skills, settings and lock hooks
  '.githooks', // development lock + main guard hooks
  'CLAUDE.md',
  'START_CLAUDE_SESSION.md',
  'BRANCH_WORKFLOW.md',
  'RELEASES.md',
  'SESSION_HANDOFF.md',
  'PROGRESS.md',
  'KNOWN_ISSUES.md',
  'USER_FEEDBACK.md',
  'FEATURE_MATRIX.md',
  'IMPLEMENTATION_PLAN.md',
  'DECISIONS.md',
  'RESEARCH_NOTES.md',
  'ARCHITECTURE.md',
  'PROJECT_SPEC.md',
  'START_PROJECT.md',
  'DEVELOPMENT_LOCK.md',
  'CONTINUE_PROMPT_SAME_COMPUTER.txt',
  'CONTINUE_PROMPT_OTHER_COMPUTER.txt',
  'setup_parts.json', // stray working file from round 5, used by nothing
  'scripts/dev-lock.mjs',
  'scripts/release-export.mjs',
  'tests/integration/devLock.test.ts',
];

/** Files a release must contain to build, test, package and publish from a clean clone. */
const REQUIRED = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts',
  'src/electron/main.ts', 'src/server/cli.ts', 'src/web/App.tsx',
  'build/icon.ico', 'build/icon.png', 'build/installer.nsh', 'build/portable-splash.bmp',
  'scripts/build-electron.mjs', 'scripts/verify-dist.mjs', 'scripts/release-notes.mjs',
  '.github/workflows/windows-build.yml', '.gitignore',
  'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/USER_GUIDE.md', 'docs/BUILDING.md', 'docs/screenshots',
];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--list')) {
  console.log(DEVELOPMENT_ONLY.join('\n'));
  process.exit(0);
}
const source = opt('source');
const version = opt('version');
const base = opt('base') ?? 'origin/main';
const trailers = args.flatMap((a, i) => (args[i - 1] === '--trailer' ? [a] : []));
if (!source || !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: node scripts/release-export.mjs --source <development commit> --version X.Y.Z [--base origin/main] [--dir <folder>] [--trailer "…"]');
  process.exit(2);
}

const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (msg) => {
  console.error(`release-export: ${msg}`);
  process.exit(1);
};

const sourceSha = git(repo, 'rev-parse', '--verify', `${source}^{commit}`);
const baseSha = git(repo, 'rev-parse', '--verify', `${base}^{commit}`);
const branch = `release/v${version}`;
const dir = path.resolve(opt('dir') ?? path.join(path.dirname(repo), `${path.basename(repo)}-release-v${version}`));

// The approved commit must already carry the release's version and changelog section.
const srcPkg = JSON.parse(git(repo, 'show', `${sourceSha}:package.json`));
if (srcPkg.version !== version) fail(`package.json at ${sourceSha.slice(0, 7)} is ${srcPkg.version}, not ${version} — bump it on development first.`);
if (!new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(git(repo, 'show', `${sourceSha}:CHANGELOG.md`))) fail(`CHANGELOG.md at ${sourceSha.slice(0, 7)} has no "## [${version}]" section.`);
// The source must be on development (pushed), so the release can be traced back to tested work.
if (!git(repo, 'branch', '-r', '--contains', sourceSha).split('\n').some((b) => b.trim() === 'origin/development')) fail(`${sourceSha.slice(0, 7)} is not on origin/development — push it first.`);
if (git(repo, 'tag', '-l', `v${version}`)) fail(`tag v${version} already exists.`);
if (fs.existsSync(dir)) fail(`${dir} already exists — remove it (git worktree remove) or pass --dir.`);

git(repo, 'worktree', 'add', '-q', '-b', branch, dir, baseSha);
// Replace the whole tree by the source's tree, then drop the development-only paths.
git(dir, 'rm', '-r', '-q', '--ignore-unmatch', '.');
git(dir, 'checkout', sourceSha, '--', '.');
for (const p of DEVELOPMENT_ONLY) git(dir, 'rm', '-r', '-q', '--ignore-unmatch', '--', p);
const pkgPath = path.join(dir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
for (const k of Object.keys(pkg.scripts)) if (k.startsWith('dev:lock:')) delete pkg.scripts[k];
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
git(dir, 'add', 'package.json');

// Checks: everything needed is there, nothing development-only is, and only package.json differs
// from the source apart from the removals.
const tracked = new Set(git(dir, 'ls-files').split('\n'));
const has = (p) => tracked.has(p) || [...tracked].some((f) => f.startsWith(`${p}/`));
const missing = REQUIRED.filter((p) => !has(p));
const leaked = DEVELOPMENT_ONLY.filter(has);
if (missing.length) fail(`missing from the release: ${missing.join(', ')}`);
if (leaked.length) fail(`development-only paths still present: ${leaked.join(', ')}`);
const changed = git(dir, 'diff', '--cached', '--name-status', sourceSha).split('\n').filter(Boolean);
const unexpected = changed.filter((l) => !(l.startsWith('D\t') || l === 'M\tpackage.json'));
if (unexpected.length) fail(`unexpected differences from ${sourceSha.slice(0, 7)}: ${unexpected.join('; ')}`);

const message = [`Release v${version}`, '', `Stable snapshot of development ${sourceSha} without the development-only files`, '(scripts/release-export.mjs, BRANCH_WORKFLOW.md).', '', `Release-Source: ${sourceSha}`, ...trailers].join('\n');
git(dir, 'commit', '-q', '--no-verify', '-m', message); // the worktree has no .githooks; nothing is pushed here
const releaseSha = git(dir, 'rev-parse', 'HEAD');

console.log(`Release v${version} prepared (not pushed).
  worktree:  ${dir}
  branch:    ${branch} = ${releaseSha}
  parent:    ${baseSha} (${base})
  source:    ${sourceSha} (development)
  removed:   ${changed.filter((l) => l.startsWith('D\t')).length} development-only files; package.json without dev:lock scripts

Next (BRANCH_WORKFLOW.md → Release workflow):
  1. Verify from that folder: npm ci, npm run typecheck, npm test, npm run dist, npm run dist:verify.
  2. Review: git -C "${dir}" diff --stat ${baseSha} HEAD
  3. Only with the owner's explicit approval for v${version}:
       git -C "${repo}" push origin ${branch}:main                       (fast-forward, never --force)
       git -C "${repo}" tag -a v${version} ${releaseSha} -m "OfflineJeopardy v${version}"
       git -C "${repo}" push origin refs/tags/v${version}                 (the workflow builds and publishes)
     with OJ_RELEASE_APPROVED=v${version} set for those pushes (the pre-push hook asks for it).
  4. Record the release in RELEASES.md on development; remove the worktree: git worktree remove "${dir}"`);
