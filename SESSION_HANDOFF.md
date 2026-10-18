# Session handoff

Read this first, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 7".

## Current state (session 10, 2026-10-17 — milestone C committed and pushed)

- **Branch:** `main`, pushed to `origin/main` (https://github.com/geolaudy/OfflineJeopardy). Version in package.json: **0.11.0** (last release v0.11.0; no release for round 7 yet).
- **Round 7 (IMPLEMENTATION_PLAN milestone 21):** A, B, G (R7-32 research) and **C done** and tested. **Not started: D (iPad host), E (developer tools), F (AI/import).**
- **Tests (end of session 10):** tsc clean, Vitest 293/293, Playwright 46 specs (45 passed in the full run; `presentation.spec` "team buzz-in" is intermittent under full-suite load — it passed 5/5 on re-runs and in the baseline).

### Single recommended next task

**Milestone D, starting with R7-22 (iPad score editor, P1)** — replace `ScoreAdjust` in `src/web/pages/host/Live.tsx` with the editor in `references/host_score_adjust_screen*.png`: editable score field, − / + stepping by the round's lowest clue value, accumulated change shown green/red, Save / Cancel, "Latest score changes" with remove/reverse (needs an engine action to reverse a `score_adjust` event — check `src/server/engine/engine.ts` and the undo model first), Remove Player with confirmation. Manual changes stay silent/unanimated on the TV (D68). Then R7-24 (striped "CORRECT RESPONSE" band, `references/host_controller_layout.png`), R7-21 / R7-25 / R7-20 (preview fixed size, shared tokens), R7-18, R7-23, R7-26, R7-27. After D is tested: release **v0.12.0** (windows-release skill).

### Two developers, two machines

- Developers alternate sessions on the same repo: **geolaudy** (original machine) and **mvanwitz** (second machine, from session 10). Always `git pull` before starting and push before stopping; if both work at once, use a feature branch.
- Git-ignored folders that must be copied by hand to each machine: `new_sfx/` (owner's sounds — personal use only, never commit or upload) and `references/` (owner's reference screenshots for round 7).
- Second machine notes: no Python installed — use Node scripts for scripted edits (write the script with the Write tool into the scratchpad, not a bash heredoc, which mangles quotes); run `npx playwright install chromium webkit` once on a new machine.
- The session-9 machine stopped at the usage limit without a handoff; nothing was lost (all its work was pushed). Commit + push after every milestone so this stays true.

## Session 8 (2026-10-17) — round 6, stopped at the usage limit

- **All round-6 milestones (A–F) are done, merged and tested**; `main` pushed to origin. Version **0.11.0**, tag `v0.11.0` pushed (GitHub Actions publishes the release).
- Tests: tsc clean, Vitest 273/273, Playwright 41/41, verify-dist 17/17.
- Local artifacts (include the owner's sounds — personal use only, never upload): `release/OfflineJeopardy-Setup-0.11.0.exe`, `release/OfflineJeopardy-Portable-0.11.0.exe`, `release/win-unpacked/`.
- **Owner to check:** the GitHub release page for v0.11.0 has the installer, portable exe and SHA256SUMS.txt (the API check is blocked here). On real devices: fair buzzing with real phones on Wi-Fi (K35), TV swipe smoothness on the TV PC (K36), the new phone buzzer on real phones (K37), the new TV lobby layout on the TV.
- The milestone-C worktree `.claude/worktrees/agent-a2b32342d6c9018bf` is merged and can be removed.
- Read FEATURE_MATRIX "User feedback round 6" for per-item status.


(Older sections below are history.)

## Current state (updated 2026-10-15, session 7)

- Branch: `main`, pushed to `origin/main`. Release **v0.10.0** tagged (GitHub Actions builds the public release; see PROGRESS.md for the verified release record).
- `package.json` version: **0.10.0**. Tests at the last full run: **Vitest 226/226, Playwright 38/38**.
- Local artifacts (include the owner's sounds — personal use only, do not upload): `release/OfflineJeopardy-Setup-0.10.0.exe`, `release/OfflineJeopardy-Portable-0.10.0.exe`, `release/win-unpacked/` (verify-dist **17/17**, incl. "serves the Jeopardy!/Buzzinga sounds — 9 cues").
- Round-5 requirements: USER_FEEDBACK.md "Round 5" (R5-2 … R5-20), IMPLEMENTATION_PLAN milestone 19, FEATURE_MATRIX "User feedback round 5", decisions D55–D63.

## Round 5 status (all milestones done and tested)

| Milestone | Items | Status |
|---|---|---|
| A — critical bugs | R5-15 undo timer, R5-18 wager permissions, R5-16 picture, R5-19 Final answer submit/change, R5-20 Daily Double! on phones, R5-9 sound folders | Done, tested (U + I + E) |
| B — home + lobby | R5-2 home screens/recent games, R5-4 no setup screen, R5-3 active lobby/rules/QR/board chooser/compact teams | Done, tested |
| C — teams | R5-5 slots, Unassigned, self-selection, drag + tap, capacity, empty teams, warning, mode memory, identity, saved-team linking | Done, tested |
| D — phones | R5-17 lobby view, I'm New first, nicknames, others' stats | Done, tested |
| E — host gameplay (agent) | R5-12 intro controls + live preview, R5-13 board replica, R5-14 clue view | Done, tested (emulation) |
| F — presentation (agent) | R5-6 swipes, R5-7 score deltas, R5-8 typography, R5-10 podium + fanfare, R5-5.10 team buzz-in | Done, tested (R5-8 visual only) |
| G — AI (agent) | R5-11 Gemini + provider registry | Done, tested with a fake Gemini API only (K31) |

## Owner's assets (important)

- `new_sfx/` holds the owner's sound files + a clue background image. **Git-ignored. Never commit or publish them.**
- `npm run build:electron` copies the audio into `build/private-sfx/` (git-ignored) → a *local* `npm run dist` ships them in `resources/soundpacks/buzzinga` (personal use only). The GitHub workflow has no `new_sfx`, so public releases contain none; `verify-dist` fails in CI if any are present.
- Dev server: `npm run dev:server` passes `--sfx=new_sfx`.
- The clue background is recreated in CSS (the JPEG is not used); TV fonts are OFL look-alikes (licensed fonts plug in via Windows install or `<data>/fonts/clue|category|value.*`).

## Builds / release workflow

Unchanged from session 5: `npm run dist` + `npm run dist:verify`; release = bump version + CHANGELOG section → commit/push → `git tag -a vX.Y.Z` → push tag → GitHub Actions builds, verifies and publishes. No `gh` CLI; verify via the GitHub API with the stored git credential.

## Gotchas

- Do not leave a shell inside `test-results/` (Playwright hangs on Windows).
- Python edit scripts: write with `newline=''`; **never put regexes with `\b` in a heredoc** — write the script to a file (a heredoc turned `\b` into backspace characters once).
- Stopping a Playwright run can leave its test server on port 3210; check `netstat -ano | grep 3210` before re-running.

## After v0.8.0 (same session)

- Play-testing: engine fuzzer (`tests/unit/playtest.fuzz.test.ts`, `FUZZ_GAMES=3000` locally), browser play-test (`tests/e2e/playtest.spec.ts`), soak test (`tests/integration/soak.test.ts`). Fixed stuck states when removing players mid-game, Final with nobody eligible, input-bridge flood limit, small-screen overflows.
- Features: practice games advance by themselves, per-sound volume, leaderboard minimums, local/OpenAI-compatible AI provider, Create a board with AI, head to head on the TV, migration v5 ("Final Wager" → "Final Jeopardy!").
- E2E specs must clean up what they leave behind (lobbies, boards, settings) — game.spec restores "trust localhost" in afterEach.

## Next recommended tasks

1. Owner on real devices: try Gemini with a real key (K31); team lobby drag-and-drop and the new clue screen on the real iPad (K32, K34); scan the smaller join QR from the sofa (K33); listen to the victory fanfare and the Final swipes on the TV.
2. If the owner wants the recordings in the GitHub download: not possible without redistribution rights — keep the "Sounds folder next to the exe" route (K28).
3. Earlier open items: Joy-Con vibration on hardware (K25), local AI with a real Ollama (K30), workspaces (O6), plugin system (O13).
