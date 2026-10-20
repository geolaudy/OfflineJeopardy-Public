# Session handoff

Read this first, then `PROGRESS.md` (top section) and `FEATURE_MATRIX.md` → "User feedback round 13". Ready-to-paste resume prompts: `CONTINUE_PROMPT_SAME_COMPUTER.txt` / `CONTINUE_PROMPT_OTHER_COMPUTER.txt`.

**Before anything else: the development lock (`DEVELOPMENT_LOCK.md`).** `npm run dev:lock:status`, then `npm run dev:lock:acquire -- --task "…"`. Do not change files while another computer holds it.

## Current state (session 16, 2026-10-20 — round 13 done, not released; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` 6649f66 (v0.16.0 released), clean. Development lock acquired (generation 2), kept through a usage-limit pause, **released at the end of session 16** (acquire it before you start).
- **Git:** `main` = `origin/main` = the "Session 16 handoff" commit (after the round 13 commit 348643f), pushed, clean tree. package.json still **0.16.0**; CHANGELOG [Unreleased] = round 13 (not released — round 13 is a layout round that should first be looked at on the real iPad; release it as 0.17.0 after the owner's check, with the windows-release skill).
- **Round 13 (USER_FEEDBACK "Round 13", plan milestone 27, FEATURE_MATRIX "User feedback round 13", D94–D97) — all done and tested automatically:**
  - Host live screen (R13-1 … R13-8): one persistent `GameFrame` for the embedded view and full screen (header row with menu · stage text / red answer strip · Options · Fullscreen; TV picture as wide as the screen allows; 72 px band; score cards in the height left). Stages fill it through portals (`FrameParts`). Full screen on an iPad in landscape is edge to edge (asserted). Larger score cards with a colour ring; larger texts; introduction categories in the header.
  - Preview animations (R13-13): the host preview renders the TV's own `Stage` (board fill-in, clue zoom); `quietStart` for a preview opened mid-game; tiles are tapped through transparent `HostBoardHits` buttons placed from boxes the preview reports.
  - Lobby (R13-9 … R13-12): TV Wi-Fi in a labelled box, the join address under the QR code (measured to its width); iPad lobby in two columns of the screen's height (15 players + 15 controllers without scrolling, solo mode); compact controller cards with a settings sheet; Buzzers tab / page fits, including after a buzzer check (order folded away).
  - Fix found on the way: a Final Jeopardy! answer submitted within 0.7 s of typing could be un-submitted by the delayed draft autosave (`PlayTab.tsx`); the pending autosave is cancelled on submit.
- **Tests:** full Playwright **88/88**, Vitest **382/382**, tsc clean. New spec `tests/e2e/round13.spec.ts`. Note: Playwright empties `test-results/` when it starts — keep run logs elsewhere.
- **Local build (end of session 16, `npm run release:local`, verify-dist 17/17; personal, includes new_sfx — never upload):** `release/OfflineJeopardy-Setup-0.16.0.exe`, `release/OfflineJeopardy-Portable-0.16.0.exe`. They carry the round 13 code but still say 0.16.0 (no version bump until the release); the published v0.16.0 on GitHub is unchanged.
- **Owner to check on the real iPad (K52):** the host screen embedded and full screen (landscape + portrait, Safari tab and Home Screen app), score cards with your real player count, the lobby and Buzzers tab with real Joy-Cons, the TV lobby with Wi-Fi shown.

### Single recommended next task (session 16)

1. Acquire the development lock, then: the owner's feedback on round 13 (record it as USER_FEEDBACK "Round 14"). If the owner is happy: release 0.17.0 (windows-release skill).
2. Without new feedback: K47 / K48 / K52 real-device checks with the owner; then O9 (accessibility audit) and K42.

## Previous state (session 15, 2026-10-19 — round 12 done, v0.16.0 released; on DESKTOP-6HN0OQ4 / geolaudy)

- Started from `origin/main` e1aed4d (v0.15.0 released). This computer had 6 old unpushed commits (an earlier, superseded round-7 F attempt) — kept on the local branch `archive/machine-b-r7f-unpushed` only; `main` was reset to `origin/main`.
- **Git:** `main` = `origin/main` = the "Session 15 handoff" commit (after release commit fad0766), pushed, clean tree. **Development lock: released** at the end of session 15 (acquire it before you start). package.json **0.16.0**; CHANGELOG [0.16.0] = round 12, [Unreleased] empty.
- **Round 12 (USER_FEEDBACK "Round 12", plan milestone 26, FEATURE_MATRIX "User feedback round 12") — all done and tested automatically:**
  - R12-1 development lock (66e3238) — `scripts/dev-lock.mjs`, `.githooks/`, `.claude/settings.json` hooks, `DEVELOPMENT_LOCK.md`, CLAUDE.md §36; devLock 12/12; used for real this session.
  - R12-3…8 host full screen redesign (D89) — edge-to-edge blue, top bar (menu / Options / minimise), slide-in menu, three-column answer band, button family, centred score cards, Reveal Answer in the Unlock slot while the timer runs, compact layout for phones in landscape.
  - R12-9 iPad top edge (D93, `--safe-top`) — **awaiting real-iPad check (K47)**.
  - R12-10 subheadings at 65 %. R12-11 Play as Guest (D90, migration v7). R12-12 lobby Test Buzzer (D91). R12-13 Wi-Fi details (D92) — **automatic name / password awaiting a Wi-Fi PC check (K48)**; this PC is wired.
- **Release v0.16.0:** full Playwright **73/73**, Vitest **382/382**, verify-dist **17/17**; tag v0.16.0 published: https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.16.0 (GitHub Actions run 39366260048 succeeded; installer, portable and SHA256SUMS.txt verified via the API). **Local build (personal, includes new_sfx — never upload):** `release/OfflineJeopardy-Setup-0.16.0.exe`, `release/OfflineJeopardy-Portable-0.16.0.exe`.
- **Before any Playwright run:** `npm run build:web` — the test server serves `dist/`; a stale build here once looked like a WebKit crash.
- **References** (`references/`, git-ignored, not on GitHub — they contain the owner's photo; copy by hand): `0.15.0 host fullscreen board improved.png`, `0.15.0 host fullscreen clue improved.png`, `0.15.0 host fullscreen menu open example.png`, `topedge_fadeoff_example.png`.
- **Owner to check on real devices:** the new full screen on the iPad (landscape / portrait, Home Screen app and Safari), nothing faded at the top of any page in the Home Screen app, Play as Guest + Test Buzzer on real phones, a Joy-Con press in the lobby lights its player's card, Wi-Fi name / password on the Wi-Fi game PC.

### Single recommended next task (session 15)

1. Acquire the development lock (top of this file), then: the owner's feedback on round 12 (record it as USER_FEEDBACK "Round 13").
2. Without new feedback: real-device checks of K47 / K48 with the owner; then the older open items (accessibility audit O9, reading media lengths on the server K42).

### Two development computers (from session 15)

- **DESKTOP-6HN0OQ4** (geolaudy, original machine — session 15) and the **mvanwitz** machine. Only one works at a time: the development lock decides (DEVELOPMENT_LOCK.md). Release it at the end of a session; after a crash it expires 15 minutes after the last heartbeat.
- The local branch `archive/machine-b-r7f-unpushed` on DESKTOP-6HN0OQ4 is an old, superseded round-7 F attempt — keep, don't merge.

## Current state (session 14, 2026-10-18 — rounds 10 + 11 done; v0.15.0 released)

- **Branch:** `main` = `origin/main`, clean. package.json **0.15.0** = the latest GitHub release (https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.15.0, GitHub Actions run 39171324571 succeeded; 3 assets verified via the API: installer, portable, SHA256SUMS.txt). CHANGELOG **[Unreleased]** is empty. v0.14.0 (round 10) was released earlier this session.
- **Round 11 (USER_FEEDBACK "Round 11", plan milestone 25) — done and tested:**
  - A: Buzzinga picture / sound clue text → clue text (both caption lines; no caption); one "buzzers open" glow (the whole-box shadow drew a second line above the timer); no TV "buzzed in" card on the host preview; host timer line along the top of the control band; controls centred.
  - B (D85): host full screen (Fullscreen API or window-filling layout, Esc, nothing remounts) and one fitting for full screen and the embedded preview — top strip (answer band / status) · TV area at the TV's proportions with blue around it · control band (timer line, next step, Fullscreen button).
  - C (D86): host/join web-app manifests (scope "/", standalone, icons) — the cause of Safari's bar on some pages of the iPad Home Screen app — and one safe-area rule so every host page clears the status bar (the Boards title sat under it).
  - D (D87): Final Jeopardy! answering stays open after the think time until the host closes it (rule `finalClose`, default 'host'; 'timer' = old behaviour).
- **Tests:** tsc clean, **Vitest 360/360**, **full Playwright 70/70**, verify-dist 17/17.
- **Local build (personal, includes new_sfx — never upload):** `release/OfflineJeopardy-Setup-0.15.0.exe`, `release/OfflineJeopardy-Portable-0.15.0.exe`.
- **Owner to check on real devices:** re-add the iPad Home Screen icon from the host page, then every page (K46); host full screen on the iPad (K45); the new frame in landscape / portrait; Final answering after time-up with real phones; a Buzzinga picture-clue import.
- **Code style note:** do not run Prettier with its defaults on project files — the code base uses single quotes and long lines (a default run rewrote whole files in round 10; fixed this session).

### Single recommended next task

1. Wait for the owner's feedback on 0.15.0 (record it as the next USER_FEEDBACK round).
2. Otherwise: hardware checks (Joy-Cons, iPad, TV), the accessibility audit (O9), reading media lengths on the server at upload (K42), P3 ideas (O6 workspaces, O13 plugins, profile import, a data-folder UI).

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
