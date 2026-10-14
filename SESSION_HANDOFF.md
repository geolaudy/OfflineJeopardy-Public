# Session handoff

Read this first in a new session, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 3".

## Current state (updated 2026-10-14, end of session 5)

- Branch: `main`, pushed to `origin/main`.
- Releases: **v0.6.0** (published with installer + portable + SHA256SUMS) and **v0.7.0** (published and verified: installer, portable, SHA256SUMS).
- `package.json` version: **0.7.0**.
- Tests at the last full run: Vitest 139/139, Playwright 27/27.

## Round 3 (USER_FEEDBACK.md "Round 3", IMPLEMENTATION_PLAN milestone 17)

| Milestone | Items | Status |
|---|---|---|
| A — immediate fixes | R3-1…R3-5 | Done, tested (v0.6.0) |
| B — lobby statistics | R3-6…R3-8 | Done, tested (v0.6.0) |
| C — bot gameplay | R3-9…R3-13 | Done, tested (v0.7.0) |
| D — optional AI bots | R3-14 | Implemented + tested with a fake provider; **not tried with a real API key** (K26) (v0.7.0) |
| E — builds/releases | R3-15/16 | Done: `npm run dist` + `npm run dist:verify` locally; tag → GitHub Actions builds, verifies and publishes |

## Builds

- `npm run dist` → `release/OfflineJeopardy-Setup-<v>.exe`, `release/OfflineJeopardy-Portable-<v>.exe`, `release/win-unpacked/`.
- `npm run dist:verify` → 15 checks incl. headless `--smoke-test` start of both executables (passes on this Windows 10 PC for 0.7.0). The NSIS installer itself is not executed (per-machine install needs UAC).
- `release/` is git-ignored.

## Release workflow

Bump version + CHANGELOG section → commit/push → `git tag -a vX.Y.Z` → `git push origin vX.Y.Z`. `.github/workflows/windows-build.yml` (windows-latest) runs typecheck, Vitest, dist, verify, then publishes the release with both executables + SHA256SUMS.txt. No `gh` CLI here; the repo is private, so verification uses the GitHub API with the stored git credential (never printed).

## Gotchas found this session

- Do not leave a shell's working directory inside `test-results/` — Playwright then hangs on Windows (it cannot delete the folder).
- Python edit scripts must write with `newline=''` (otherwise CRLF line endings).

## Next recommended tasks

1. User: try AI answers with a real key (Settings → AI answers → Test connection) and Joy-Con vibration (K25).
2. Bots could advance rounds / start the Final in practice games (K27).
3. More AI providers (OpenAI-compatible / local Ollama) behind the same `AiService` interface if wanted.
