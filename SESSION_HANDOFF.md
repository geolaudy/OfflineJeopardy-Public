# Session handoff

Read this first in a new session, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 3".

## Current state (updated 2026-10-13, session 5)

- Branch: `main` (pushed to `origin/main`).
- Latest release tag: **v0.5.0** (tag only; no GitHub Release with assets existed before session 5).
- `package.json` version: **0.6.0** (in development; CHANGELOG.md has the 0.6.0 section marked unreleased).
- Tests: Vitest 128/128, Playwright 24/24 (last full run after milestone A).

## Round 3 roadmap (USER_FEEDBACK.md "Round 3", IMPLEMENTATION_PLAN milestone 17)

| Milestone | Items | Status |
|---|---|---|
| A — immediate fixes | R3-1 media pickers, R3-2 leaderboard on TV, R3-3 Return to Lobby, R3-4 settings on TV, R3-5 bot difficulty | Done, tested, pushed (d4082ef) |
| E (early) — builds/releases | verify script + smoke test, Actions workflow, CHANGELOG, release notes | Done locally; workflow not yet exercised on GitHub |
| B — lobby statistics | R3-6 cards with wins/games, R3-7 crown (reigning winner via `LobbyManager.reigning`, all-time leader), R3-8 bot cards | Next |
| C — bot gameplay | R3-9 clue selection, R3-10/13 visible answers + awaiting judgment, R3-11 wrong answers, R3-12 timing | Not started |
| D — optional AI bots | R3-14 | Not started |

## Builds

- Local: `npm run dist` → `release/OfflineJeopardy-Setup-0.6.0.exe`, `release/OfflineJeopardy-Portable-0.6.0.exe` (≈115 MB each), `release/win-unpacked/`.
- `npm run dist:verify` → 14/14 checks passed on Windows 10 (both packaged executables started headlessly via `--smoke-test` and served the app, sample board and image pipeline). The **installer itself was not run** (per-machine install needs UAC).
- `release/` is git-ignored.

## Release workflow

Tag `vX.Y.Z` matching package.json → `.github/workflows/windows-build.yml` publishes the GitHub Release. The `gh` CLI is not installed here; the repository is private (unauthenticated API calls return 404).

## Next recommended task

Milestone B (lobby player cards with wins / games played, crown for the reigning winner and a subtle all-time wins marker, bot cards), then release **v0.6.0** through the tag workflow and verify the assets.
