// Prints the release notes for one version: its CHANGELOG.md section plus download notes.
// Usage: node scripts/release-notes.mjs v0.6.0
import fs from 'node:fs';

const tag = process.argv[2] ?? '';
const version = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/release-notes.mjs v1.2.3');
  process.exit(2);
}
const log = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const start = log.search(new RegExp(`^## \\[?v?${version.replace(/\./g, '\\.')}\\]?`, 'm'));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const rest = log.slice(start);
const next = rest.slice(3).search(/^## /m);
const section = (next < 0 ? rest : rest.slice(0, next + 3)).trim().split('\n').slice(1).join('\n').trim();

console.log(`${section}

## Downloads

- **OfflineJeopardy-Setup-${version}.exe** — installer (adds Start menu and desktop shortcuts).
- **OfflineJeopardy-Portable-${version}.exe** — no installation; keeps its data in an \`OfflineJeopardyData\` folder next to the exe.
- **SHA256SUMS.txt** — checksums of both files.

The executables are not code-signed, so Windows SmartScreen may warn the first time: choose **More info → Run anyway**. Your boards, players and history are kept when you upgrade.`);
