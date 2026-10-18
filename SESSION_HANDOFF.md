# Session handoff

Read this first, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 8". Ready-to-paste resume prompts: `CONTINUE_PROMPT_SAME_COMPUTER.txt` / `CONTINUE_PROMPT_OTHER_COMPUTER.txt`.

## Current state (session 12, 2026-10-18 — round 8 milestones A, B, C committed and pushed)

- **Branch:** `main`, pushed to `origin/main` (https://github.com/geolaudy/OfflineJeopardy). Version **0.12.0** (released, tag v0.12.0, 3 assets). Everything after it is in `main` only: round 7 milestone E (developer tools) and round 8 A–C.
- **Round 8 (IMPLEMENTATION_PLAN milestone 22, USER_FEEDBACK "Round 8"):** A (R8-2 clue flicker, R8-3 iPad board styling, R8-4 board fill → intro, R8-5 Final answer sizing), B (R8-6.1–6.4 minimized lobby) and C (R8-7 line breaks, R8-8 bold/italic/underline, R8-9 category subheadings) **done and tested**.
- **Round 7:** A–E and G done. **F (R7-30.1–30.5, AI / Buzzinga import) not started.**
- **Tests:** tsc clean, Vitest 304+ (see PROGRESS), Playwright full run 49/49 after milestone E; round-8 specs and every affected spec passing (a full run after milestone C is recorded in PROGRESS when it finishes).
- **Owner to check on real devices:** the round-7/8 iPad screens on the real iPad (K38), lobby phone delays with real phones (K40), the TV layouts on the TV, the board-fill timing with the real sound pack.

### Single recommended next task

**Release v0.13.0** (round 8 A–C + developer tools) with the windows-release skill once a full Playwright run is green: version bump, CHANGELOG section, `npm run release:local`, commit, push, tag `v0.13.0`, verify the GitHub release (API with the stored git credential — the repo is private). **Then round 7 milestone F — R7-30.1 … R7-30.5 (AI / import):** 30.1 Buzzinga imports bring their images/audio/video (`server/importers/sources` + `importers/media.ts`; graceful failures); 30.2 verify bot AI answers are really used and add bounded retries with backoff for Gemini 503 (`aiProviders/gemini.ts`); 30.3 AI boards default to 2 rounds + Final, validated, never saved as complete when incomplete; 30.4 research sign-in-based AI connections (official methods only, RESEARCH_NOTES); 30.5 AI clue from a prompt in the board editor (clue + answer, editable, no silent overwrite).

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
