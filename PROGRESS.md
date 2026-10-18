# Progress

## Session 12 — 2026-10-18 (second machine, mvanwitz; round 8)

- Round-8 requirements recorded (USER_FEEDBACK "Round 8", plan milestone 22, FEATURE_MATRIX). Milestone E (developer tools) verified: full Playwright **49/49**.
- **Milestone A:** R8-2 clue flicker — root cause: the clue stage's CSS fade-in was suppressed only while the tile zoomed; removing the `is-zooming` class at the end of the zoom started the fade, so the text blinked out and faded back in. The stage that zoomed in is now `is-still` for good (a later Daily Double! stage still fades in). R8-3 — the iPad replica's classic tokens predated R7-5 (old gap, no column/row gaps, big offset+blur value shadow); now the TV's proportions per tile and its hard shadow. R8-4 — `revealPlan`: the category row lights as the last tile finishes and the title follows it (no dead time). R8-5 — Final answer card has a fixed height; the answer shrinks to fit (FitText).
- **Milestone B (minimized lobby, R8-6.1–6.4):** menu headings 15vh (`--mhead`) with content right under them; the minimized panel ends a gap above the content; square QR filling the panel without its caption; the panel and QR slide/fade with menu page changes.
- Test-race fix found on the way: e2e specs pressed a phone's buzzer before the phone showed the buzzers open (the press was ignored) — the "intermittent" team buzz-in failure. Six presses now wait for `data-state="open"`.
- **Milestone C (rich board text, R8-7/R8-8/R8-9):** `shared/richText.ts` + `components/RichText.tsx` — line breaks and [b]/[i]/[u] rendered on the TV (FitText, answers, Final), the iPad (answer band, Daily Double! clue, played clue, Final), phones (Final question), history and the library; bots/AI get `plainText`. Editor: the answer is a text area, B / I / U buttons and Ctrl+B/I/U, "As shown" preview. Category subheading: editor field, TV grid + iPad replica (name keeps its size), category introduction, Final (hidden until the Final). Bold reads as bold on the already-bold clue font (900 + hairline stroke); real Merriweather italics.
- **Round 7 milestone F (R7-30.1–30.5):** Buzzinga uploaded media came in as storage keys and was skipped as "not a web link" — keys now resolve to Buzzinga's public bucket (learned from its public client), and a clue whose media still fails says so with the reference in the host notes. Gemini 5xx retries (bounded, inside the answer's time budget) and a per-game count of AI vs offline bot answers (AI settings) to check that bots really use the AI. AI boards: 2 rounds + Final by default (round 2 in its own request), gaps → "incomplete". Editor: "Write from this idea" (clue + answer, never replaces without asking). Research: sign-in AI connections (Claude not allowed, Gemini OAuth heavy, ChatGPT partner-only) → API keys / local AI.
- Full Playwright run after milestone C: 51/53 — the 2 failures were the editor fields' ambiguous labels (fixed, re-run passing).
- Pre-release full run on ca9e9e4 stopped by Claude Code (this PC low on memory): 47/53 passed, the last 6 crashed (browser "Target crashed", worker exit 0xC0000142). v0.13.0 is **not** released yet — next session: one clean full run, then the release (CHANGELOG section ready).
- Tests: tsc clean, Vitest 304/304; Playwright: round8 (3), round7c-tv, round6-tv-layout, presentation, host-ipad, teams-editor, playtest, game, round7d-host, round7-tv, lobby-stats, round5-lobby passing.

## Session 11 — 2026-10-18 (second machine, mvanwitz; round 7 milestone D finished)

- Resumed from SESSION_HANDOFF (nothing new on origin). **R7-21 / R7-25 / R7-20:** `host/GameFrame.tsx` — every live state (board, introduction, clue) has a fixed header line, one 16:9 preview and a reserved control bar, so the preview keeps the same size and position (D75). The clue preview is now the TV page itself (iframe), with the answer band over its top and the Daily Double! wager (plus the clue text for the host), the bot's answer and media controls in a compact panel inside it. The old host-only clue card is gone. The TV preview stays black until ready (no "Loading…" flash). Found while testing: the bar must not clip the clue's More menu (fixed).
- New test: round7d-host "game preview" (intro, board, clue, buzzed, judged, Daily Double! — same box ±1 px in landscape and portrait; bar content fits).
- Fixed a test race in lobby.spec (read the pairing code before it loaded).
- Tests: tsc clean, Vitest 297/297, Playwright full run 47/48 (the lobby race, then fixed: 2/2 passing).
- **Release v0.12.0** (round 7 A–D + R7-32): version bump + CHANGELOG section, `release:local` passed (verify-dist 17/17), tag v0.12.0 pushed → GitHub Actions run 39102878564 succeeded → https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.12.0 with OfflineJeopardy-Setup-0.12.0.exe, OfflineJeopardy-Portable-0.12.0.exe, SHA256SUMS.txt (verified via the GitHub API).
- **Milestone E (R7-31 developer tools):** `server/fairnessSim.ts` (the R6-24 simulation moved out of the test, now shared) + `runFairnessTest`; `server/devTools.ts` — host-only `/api/dev/diagnostics` (versions, memory, event-loop delay, numbered connections with clock sync, controllers, game summary; no secrets/names/addresses), `/api/dev/diagnostics/reset`, `/api/dev/fairness` (refused during a clue / Final); `desk/DevTools.tsx` at /host/dev with the fairness test form, result tables and **Export report (JSON)**. On only with `--dev-tools` (dev server, e2e server), an unpackaged app or `OJ_DEV_TOOLS=1` (D76).
- New tests: integration devtools (4), e2e devtools.spec.
- Tests: tsc clean, Vitest **301/301**, devtools.spec passing on its own. **The full Playwright run could not complete**: this PC ran out of memory (browser pages crashed, workers exited 0xC0000142) and Claude Code stopped the run — an environment problem, not a code failure. Re-run `npx playwright test` on a machine with free memory before the next release.
- **Next:** round 7 milestone F (R7-30.x) — see SESSION_HANDOFF.md.

## Session 10 — 2026-10-17 (second developer machine, mvanwitz; round 7 milestone C)

- **Handoff recovery:** session 9 (other computer) hit the usage limit without updating PROGRESS / SESSION_HANDOFF. Reconstructed from git: everything was committed and pushed (main = origin/main at 5323344, clean tree, no stray branches or worktrees). Milestones A, B and the R7-32 research were done; C–F not started (FEATURE_MATRIX "User feedback round 7" was accurate).
- **Baseline on this machine:** Node 24.22 / npm 11.19 (CI uses Node 24), dependencies already installed. Found one regression left by session 9: `tests/unit/round7.dom.test.tsx` failed `tsc` (a test cast; the commit message said "tsc clean") — fixed. Playwright needed both browsers installed (`npx playwright install chromium webkit`; the iPad/iPhone specs use WebKit). Baseline then: tsc clean, Vitest 287/287, Playwright 45/45.
- **Milestone C (R7-2, R7-3, R7-4, part of R7-17):**
  - R7-2: every TV page heading (lobby and menu pages) is the same height (`--head`) at the top; every content panel starts on one line and uses the full width; the compact lobby panel moved into the wordmark's corner (`--lift`, wordmark hidden on menu pages) with its QR sized from that line, so it can never push a page down. With a room code the code sits at the end of the compact panel's count row.
  - R7-3: `StackedName` on the TV (nickname, profile name underneath in `--tvp-real` gray; long names shrink to 72 % and then wrap; lobby cards fit-scale their text block) — lobby cards, team rows, unassigned chips, Players page. `PersonName` (host + phones) stacked the same way, no parentheses.
  - R7-4: `server/lobbyLatency.ts` smooths the clock-sync round trip per phone (EWMA, 5/10/100 ms steps, hysteresis); the hub re-reads it every 2 s and rebuilds the lobby only when a shown value changes; lobby cards show "Phone • 25 ms", "Phone • measuring…", "Phone • not connected", "Joy-Con (L) • Bluetooth", "Keyboard key • this PC". Display only.
  - Decisions D71–D73, known issue K40.
- **Milestone D started:**
  - R7-22 score editor (`host/ScoreEditor.tsx`, references/host_score_adjust_screen*.png): editable score with − / + by the round's lowest clue value, green/red change, Save / Cancel, "Latest score changes" with take-back (new engine action `reverseScoreChange`, D74), Remove Player with confirmation (only without points, K41). Undo now also restores events an undone action had voided (pre-existing gap for refunds / attribution changes).
  - R7-24 answer band (`AnswerBanner` band variant, `answer-band.css`): red striped band across the top of the clue card with a small "Correct response · only you" label over the answer in the clue font.
  - Small D items: R7-18 (stacked names on the iPad lobby rows — names get the full width, phone status on its own line; `PersonName` is now block layout because WebKit squeezed the column flexbox and broke "QuizMaster" mid-word), R7-23 (square preview corners), R7-26 (board editor padding like the other pages), R7-27 (AI boards titled with the topic only).
  - Fixed an intermittent e2e failure (playtest "sound packs" / leaderboard minimums): `NumberSetting` overwrote what the host was typing when the previous save came back, so a quick second change was lost. It now keeps the typed text while editing.
  - Tests: tsc clean, Vitest 297/297, Playwright 47/47 (full run, with R7-22); after R7-24: round7d-host, host-ipad, game, practice, media, round6-host passing.
- Tests at the end of milestone C: tsc clean, **Vitest 293/293** (new round7c unit + integration), **Playwright 46 specs: 45 passed in the full run + `presentation.spec` "team buzz-in" failed once and passed 5/5 on re-runs** (intermittent under full-suite load; it passed in the baseline too). New: `tests/e2e/round7c-tv.spec.ts`.

## Session 9 — 2026-10-17 (round 7, other computer — reconstructed from git in session 10)

- Requirements recorded (4dc2c14): USER_FEEDBACK "Round 7" (R7-2 … R7-32), IMPLEMENTATION_PLAN milestone 21, FEATURE_MATRIX round 7, board reference measurements in RESEARCH_NOTES; `references/` git-ignored.
- R7-32 research (330addf, merged 8b2b06f / 99516e1): Joy-Cons through Apple TV + Steam Link (docs/JOYCON_APPLETV_STEAMLINK.md); every gamepad button selectable, menu buttons never buzz, "Controller N (Xbox-compatible)" labels.
- **Milestone A (41352f8):** Final judgment sounds once per judgment (incl. $0 wagers / bots), wager-only Final reveal with vector check/X, centred Final clue, silent manual score adjustments (D68), iPad Safari shell fix (D69), host sub-page Back, constant phone buzzer.
- **Milestone B (5323344):** reference board colours/spacing/shadows as shared tokens (D70), board-control star, clue text visible through a slower zoom, centred clues stable on reveal, score-card colour setting.
- Tests per the commit: Vitest 287/287, Playwright round7-tv + 14 regression specs. The session ended at the usage limit before PROGRESS / SESSION_HANDOFF were updated.

## Session 8 — 2026-10-17 (user feedback round 6, reviewing v0.10.0)

- Requirements recorded as R6-2 … R6-24 (USER_FEEDBACK.md "Round 6"), plan in IMPLEMENTATION_PLAN milestone 20, statuses in FEATURE_MATRIX "User feedback round 6", decisions D64–D67, known issues K35–K37 (K16 resolved).
- **Milestone A (1815a1e):** Final Jeopardy! closes into a waiting stage when the think time ends (timer removed, nothing revealed) and the host taps **Begin Answer Reveals**; TV timers without label and gone at zero; one highlight per score box (buzz-in replaces the picker ring); iPad ring no longer clipped; the "board scatter" sound under the Final was the new-round cue firing because the Final changes the round index (cues extracted to soundCues.ts); descender room for names.
- **Milestone B (6f60b53):** the TV score box shows +$600 / −$600 and then the new total (no side labels / pills, $ prefix on TV scores); full-section phone buzzer (red / yellow / green with labels, pointerdown, repeat guard).
- **Milestone E (28df4bc):** category presentation profiled with `scripts/perf-intro.mjs`: no long tasks or heavy script — every swipe frame re-rasterised the whole 1080p card (≈52 paints, ≈3 s raster per swipe). Swipe layers now composited (will-change + WAAPI transforms): software raster 43 → 59 fps, dropped frames 19 → 1; 4× CPU 41.8 → 58.9 fps. docs/PERFORMANCE.md.
- **Milestone F (0b89ec6):** research (research agent) → docs/BUZZER_FAIRNESS_RESEARCH.md; implemented approach E: server-measured clock sync, bounded compensation, ≤ 60 ms adaptive window, corrected early rule, phone timing messages, host gap list, rule "Who buzzed first". Simulation found that the recommended 20 ms sync threshold left slow phones uncorrected (worse than arrival order) → 60 ms. Simulated correct winner on callable gaps 83–89 % → 96–98 %, median added wait ≈ 27 ms, no false early penalties.
- **Milestone D (5c8a361):** iPad intro preview without the score strip, Previous | Next, TV category text with the iPad's proportions (FitText `maxBox`).
- **Milestone C (babaf3d, merged 7bfa589):** TV lobby / menu layout (frontend agent in a worktree, finished by the lead): lobby player cards ~60 % size with a grid that prefers wider cards so full names fit (`fitCards` `idealRatio`); minimized lobby is one panel in the top-right corner; menu pages in one content panel (Boards 3 per row, Buzzers 2–3 columns); lobby header BOARD / board name / "2 Rounds • 60 Clues • Final Jeopardy!"; one right panel with Join the Game + Game Rules. New tests: round6c.dom, round6-tv-layout.spec (1080p, 4:3, 720p teams).
- Tests at the end of the session: tsc clean, **Vitest 273/273, Playwright 41/41**, `npm run release:local` → verify-dist **17/17** for v0.11.0.
- **Release v0.11.0:** version bumped, CHANGELOG section, tag `v0.11.0` pushed → GitHub Actions builds and publishes the installer, portable exe and SHA256SUMS.txt. The GitHub API check of the published release was **not** done (credential access is blocked in this environment) — the owner should confirm the release page shows the three assets.

## Session 7 — 2026-10-15 (user feedback round 5, reviewing v0.9.0)

- Requirements recorded as R5-2 … R5-20 (USER_FEEDBACK.md "Round 5"), plan in IMPLEMENTATION_PLAN milestone 19, statuses in FEATURE_MATRIX "User feedback round 5", decisions D55–D63.
- **Milestone A (critical bugs, commit dce261f):** Final Jeopardy! wagers only once the host opens wagering (server-enforced, raw socket messages refused); Daily Double! wager from the picking player's phone, host locks it; Final answers submitted vs. being changed (green/gray TV border, read-only answer + Change Answer on the phone, drafts count only if nothing was submitted); Undo back into Final answering restarts the think time (player inputs are no longer undo steps); choosing a default picture keeps the upload (migration v6 `profiles.picture_off`); sound pack folders found automatically + Add a folder; victory fanfare.
- **Milestones B/C/D (lead):** TV + host home screens with recent games and a game recap; Create Lobby straight into lobby management (no setup screen; last game's board/mode/rules reused); TV lobby with board card, live rules panel and a ~60 % QR; board chooser shown on the TV; compact lobby with teams; team slots / Unassigned / phone self-selection / drag-and-drop + tap Move / capacity / empty slots / warning / mode-switch memory / team identity by members / saved-team linking; phone lobby view, I'm New first, lobby nicknames shown as Nickname (Real name).
- **Milestones E, F, G (agents in git worktrees, merged):** host category controls (Previous, jump, Stop Auto, live TV preview), iPad board replica, three-region clue view with More menu and private answer lightbox (E); Final swipes, score deltas, typography roles, team buzz-in banner, podium (F); Gemini provider + provider registry, per-provider keys, rate-limit cooldown (G).
- Process: Playwright port configurable (`E2E_PORT`) so worktrees run their suites in parallel; `.claude/worktrees/` git-ignored.
- Tests at the end of the session: Vitest 226/226, Playwright 38/38; local verify-dist 17/17 (packaged builds serve the 9 personal sound cues).
- **Release v0.10.0** published on GitHub (tag v0.10.0, commit 1a5331a): OfflineJeopardy-Setup-0.10.0.exe, OfflineJeopardy-Portable-0.10.0.exe, SHA256SUMS.txt — verified via the GitHub API. Public builds contain no personal sounds.

## Session 6 — 2026-10-14 (user feedback round 4, reviewing v0.7.0)

- **Play-testing after v0.8.0 (user request: find edge cases):**
  - New seeded engine fuzzer `tests/unit/playtest.fuzz.test.ts`: random rules/modes/players/bots/teams, sensible + junk actions; invariants after every step (no crash, no answer/Final leaks to TV/phones/host, scores = events, unique lobby colours, undo restores exact scores, save/load round-trip, liveness). 300 games in CI; 3,000 run locally (`FUZZ_GAMES`).
  - **Bugs found and fixed:** (1) removing a player mid-game who had not scored yet — the buzzed-in player, the Daily Double! wagerer or a Final Jeopardy! contestant — left the host stuck (judging failed); (2) Undo could bring a removed player back into the Final reveal or as the picker; (3) Final Jeopardy! with nobody eligible had no button in the reveal stage (host stuck); (4) the phone's header picture showed the preferred colour instead of the lobby colour; (5) the Undo label overflowed the score bar on iPad portrait.
  - New browser play-test `tests/e2e/playtest.spec.ts`: iPad portrait host, 4:3 TV, three phones (colour clash), intro gating, wrong answer → auto re-open, Daily Double!, Final with a missing wager and an answer typed but never sent (autosave), reveal order, Return to Lobby, a Final nobody qualifies for; plus a TV reload during the intro (no board-fill replay). Media spec: image-only clue complete in the editor.
  - Tests: Vitest 155/155, Playwright 29/29.
  - Soak play-test `tests/integration/soak.test.ts` (six phones pressing at once, drop-outs/reconnects mid-clue, Final via phones, three Return-to-Lobby cycles; host/TV/phones always agree; stats counted once). It showed that all host and input-bridge messages share the 120/s phone flood limit — mashing several Joy-Cons could lose a button release. Trusted host/bridge connections now allow 2,000/s and a dropped host action gets an error reply.
  - Screen play-tests: profile creation on iPhone SE, sound packs on iPad portrait — fixed the "Jeopardy!/Buzzinga (Default)" title overflowing its card.
  - Tests: Vitest 156/156, Playwright 30/30.
- **Features after play-testing:**
  - Migration v5: saved boards' "Final Wager" round renamed "Final Jeopardy!" (library copy only; versions and finished games keep their snapshots).
  - Practice games move on by themselves when a round is played out: next round → Final Jeopardy! → results (K27); the practice player's own Final wager/answer box is open on the Final screen.
  - Per-sound volume (Settings → Sounds, slider per cue, saved on release; applies to files and built-in tones).
  - Leaderboard minimums are a host setting (K17): games before win %/average, answers before accuracy; used by the TV, host and phone leaderboards.
  - **Local AI answers:** new provider "Local AI or OpenAI-compatible (Ollama, LM Studio…)" — server address (default Ollama on this PC), key optional, model typed or loaded from the server, test connection; same prompt, limits, right-answer guard and fallbacks as the cloud provider; replies wrapped in prose are still read. Works without internet.
  - Tests: Vitest 162/162 (new ai-local.test.ts with a real fake OpenAI-compatible HTTP server), Playwright 30/30.
  - **Head to head on the TV:** host Players → Compare → Show on TV; big pictures, record against each other, headline numbers with the better one highlighted; public numbers only (a private player is named but not compared). Comparison logic moved to `stats.compareSide` (route and TV share it).
  - Test isolation: game.spec now always restores "trust localhost" (a failure there used to cascade into a dozen unrelated failures); compare.spec closes the lobby it opens.
  - Tests: Vitest 163/163, Playwright 30/30.
  - **Create a board with AI (spec §19, O7):** Boards → Create with AI (topic, categories, clues each, difficulty, Final Jeopardy!) → a draft board tagged AI-generated, every AI clue noted "AI-generated — check before playing", missing/duplicate answers left blank, editor notice; works with the local provider (no internet) or Anthropic; clear errors and nothing created when the reply is unusable or AI is not set up.
  - Tests: Vitest 165/165, Playwright 31/31.
- **Release v0.9.0 published** (GitHub Actions run 38662369595 succeeded) — https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.9.0 with OfflineJeopardy-Setup-0.9.0.exe, OfflineJeopardy-Portable-0.9.0.exe, SHA256SUMS.txt (verified via the API). Local 0.9.0 build verified 15/15 (includes the owner's sounds — personal use only).
- **AI clue helper (spec §19):** in the clue editor (only when AI is set up) — "Write a clue for this answer" and "Tidy the wording"; a suggestion box with Use it / Dismiss; accepted clues get the AI-generated note; a suggestion that contains its own answer is refused. Tests: Vitest 166/166, Playwright 31/31.
- **Editor browser test (K5 closed):** `tests/e2e/editor.spec.ts` — category drag-and-drop and arrow buttons, order saved. Playwright 32/32.

- Baseline: v0.7.0 pushed and in sync (main = origin/main). Round-4 requirements recorded (USER_FEEDBACK.md Round 4, IMPLEMENTATION_PLAN milestone 18, FEATURE_MATRIX round 4). `new_sfx/` (owner's sounds + clue background) git-ignored.
- **Return to Lobby investigation (R4-20):** the button and endpoint existed (tested in 0.6/0.7), but the lobby session lived only in memory — after an app restart, Return to Lobby produced a game without a lobby (TV "Getting ready", no join QR); and the Results back arrow silently closed the game (= new lobby). Fixed: lobby session persisted and restored with the recovered game, rematch re-opens a lobby, back arrow removed, Return to Lobby is the first/largest action, "New Lobby" secondary.
- **Milestone A (gameplay):** Final Jeopardy! redesign (phones submit, private from everyone incl. host, reveal one at a time lowest → highest pre-Final score, judge then next, time-up closes answers, answers kept in history), simplified clue controls (Unlock Buzzers → Correct/Incorrect → Reveal Answer → Return to Board; auto re-open after a wrong answer; recovery tools under More), category intro gates clue selection (engine + dedicated host screen), media-only clues valid, Daily Double! / Final Jeopardy! wording, red ANSWER banner, Options menu for rare controls.
- **Sound (part of D):** Jeopardy!/Buzzinga pack (default; Classic/Arcade/Soft kept; v2 settings migration), file→cue matching by name, installable in Settings, Classic fallback per cue, think music during the Final writing phase, board fill synced to its sound, preview buttons.
- Tests: Vitest 147/147 (new round4.test.ts; engine Final tests rewritten), Playwright 27/27.
- Pushed 550b170 (milestone A + sounds).
- **Milestone B + visuals:** TV typography (OFL look-alikes, licensed-font hooks), CSS clue background, mustard bottom glow default, picker ring + larger score boxes, smaller gold-framed QR, separated compact lobby, centred avatars without side strips, shared navigation order, Show Leaderboards on TV in menu/results. Pushed 50e2c31.
- **Milestone C:** unified Profile Picture (upload / default, circular preview) + Preferred Color; distinct lobby colours assigned by the server with a phone prompt when taken (455f18b). Pre-lobby TV: board choices that follow the host, category preview, public settings; no join QR before Open Lobby (also not on the splash).
- **Packaging:** `build-electron.mjs` stages `new_sfx` audio into git-ignored `build/private-sfx` (always created, empty in CI); `verify-dist` reports it locally and fails in CI if present.
- Tests: Vitest 154/154 (unit round4.test.ts, integration round4.test.ts: Final, return to lobby across restart ×3 games, sound pack, colours, pre-lobby), Playwright 27/27.
- **Release v0.8.0 published** (tag v0.8.0 → GitHub Actions run 38632529267 succeeded) — https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.8.0 with OfflineJeopardy-Setup-0.8.0.exe, OfflineJeopardy-Portable-0.8.0.exe, SHA256SUMS.txt (verified via the API; public build contains no personal sound files). Local build 0.8.0 (with the owner's sounds, personal use only) verified 15/15 at release/. A simulated public build without new_sfx also packaged cleanly.
- **Next:** see SESSION_HANDOFF.md.

## Session 5 — 2026-10-13 (user feedback round 3)

- Baseline: v0.5.0 already pushed (main = origin/main). Round-3 requirements recorded (USER_FEEDBACK.md Round 3, FEATURE_MATRIX, IMPLEMENTATION_PLAN milestone 17).
- **Milestone A (R3-1…R3-5):** media pickers per kind with real file filters (root cause: wildcard `accept` → registry-based filter on Windows); host Leaderboard page with **Show Leaderboard on TV** (live metric/view, saved-teams view, player/team stats on TV, Previous page / Lobby); **Return to Lobby** after a game (new game record with the same players, teams, bindings, bots, room code, board and rules; tournament carried over); read-only grouped **Settings page on the TV** (game rules, or the host's draft before the game exists); bot difficulty badges. Also fixed: phone bindings showed "ready" while the phone was disconnected; lobby refresh timer could fire after shutdown.
- Tests: Vitest 128/128 (new round3.test.ts, mediaTypes.test.ts), Playwright 24/24. Pushed d4082ef.
- **Build/release tooling (R3-15/16):** `--smoke-test` mode in the Electron main process, `scripts/verify-dist.mjs` (14 checks incl. headless start of the unpacked app and the portable exe — both passed on this Windows 10 PC), version injected from package.json (was stuck at 0.2.0), GitHub Actions Windows workflow (release only for `vX.Y.Z` tags), CHANGELOG.md + release-notes extractor. Pushed 606c223.
- **Milestone B (R3-6…R3-8):** lobby cards show games / wins (team wins labelled, never counted as solo), win % from 3 games, winning streaks, "Statistics private"; crown on the previous match's winner (players, bots, team header), medal for the most wins among players here (not shown when everyone ties), legend; saved-team record on team cards; bot cards with a difficulty line. Return to Lobby now puts the TV back on the lobby page.
- Found while testing: a shell whose working directory is inside `test-results/` makes Playwright hang on Windows (it cannot delete the folder) — keep logs and shells outside it.
- Tests: Vitest 128/128, Playwright 25/25 (new lobby-stats.spec.ts). Pushed 28b59a0.
- **Release v0.6.0 published** (tag pushed → GitHub Actions Windows build: tests, packaging, verification incl. headless start of both executables on the runner) — https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.6.0 with OfflineJeopardy-Setup-0.6.0.exe, OfflineJeopardy-Portable-0.6.0.exe, SHA256SUMS.txt (verified via the API).
- **Milestone C (R3-9…R3-13):** bots pick clues on their turn with difficulty-based strategies; bots *submit* answers (new engine action, `submission` event) instead of judging themselves — the answer timer stops, host and TV see the answer, the host judges (also Daily Wager; Final answers are written by bots and judged by the host); plausible local wrong answers from related clues / near-miss numbers; per-bot pace. Fixed: bots were labelled "(team)" in solo game history.
- Tests: Vitest 133/133, Playwright 26/26 (new bots.spec.ts; shared tests/e2e/hostSocket.ts). Pushed 6a47019.
- **Milestone D (R3-14): optional AI answers for bots.** `@anthropic-ai/sdk` added (runtime dependency). Server-side AiService (structured JSON output, low effort, server-side refusal fallback, hard timeout capped by the answer timer, per-game limit, response cache, scrubbed error messages, rejects a "wrong" answer that is actually right). Key stored write-only outside the database (DPAPI-encrypted in the Windows app). Settings card (enable, provider, model list, key save/replace/remove, test connection, timeout, per-game limit, fallback: offline answer or pass) and a per-bot "AI answers" switch; the host sees whether an answer came from the AI and why it fell back. **Not tested against the real API (no key) — K26.**
- Tests: Vitest 139/139 (new ai.test.ts, aiKey.test.ts), Playwright 27/27.
- **Release v0.7.0 published** (GitHub Actions run 38511387222 succeeded) — https://github.com/geolaudy/OfflineJeopardy/releases/tag/v0.7.0 with OfflineJeopardy-Setup-0.7.0.exe, OfflineJeopardy-Portable-0.7.0.exe, SHA256SUMS.txt (verified via the API). Local build of 0.7.0 also verified (15/15 checks incl. headless start of both executables) at release/.
- **Next:** see SESSION_HANDOFF.md (real-key AI test, Joy-Con vibration, bots advancing rounds in practice games).

## Session 4 — 2026-10-13 (user feedback round 2)

- Checkpoint: tag **v0.3.0** pushed before any change (Vitest 74/74, Playwright 12/12). Round-2 requirements recorded (USER_FEEDBACK.md Round 2, PROJECT_SPEC §44, FEATURE_MATRIX, IMPLEMENTATION_PLAN milestone 16).
- **Milestone: media clues (R2-12…R2-16).** Captions were saved but never displayed (only image alt text) — now shown under images on TV for both sides. Media-first layout sized from the real clue area and each image's aspect ratio (no cropping/stretching, invisible until loaded so nothing jumps; per-clue layout auto/media/balanced/text). Separate answer-side media (hidden from the TV until reveal; decoded before the cross-fade). Authoritative media playback state with host Play/Pause/Resume/Restart/Stop/Mute, duration from metadata (host never plays sound), server-scheduled media end; Electron TV allows autoplay. Automatic buzzer unlock: game rule off/all/media-only/per-clue + per-clue immediate/host/after media starts/after media ends. Editor: Clue presentation / Answer reveal / Layout & buzzers sections. lucide-react icons introduced; PageTitleBar fixes the Boards header.
- Tests: Vitest 78/78, Playwright 13/13 (new media.spec.ts). Practice spec now picks its board explicitly (it depended on which board was newest). Pushed 338dd0d (+3f963d6 matrix fix).
- **Milestone: board importing (R2-20/R2-21)** (built by a subagent, reviewed and wired here): plugin pipeline with SSRF-safe downloads, Buzzinga share link / CSV export / saved JSON, user-provided clue datasets and CSV, previews, duplicate warnings, rollback; Library button "From link or dataset". Buzzinga share-link parsing is **not verified against a real shareable board** (see RESEARCH_NOTES.md). Test fixture with real show clues replaced by original clues. Board packages now carry answer-side media.
- Tests: Vitest 104/104, Playwright 14/14.
- **Milestone: board & clue preview (R2-17)** — preview from the library card, editor header and each clue using the real TV components, without starting a game (ac6d2c8). **Lobby session + public presentation state on the server** (c8f6c10).
- **Milestone: lobby-first startup and unified host app (R2-1…R2-11, R2-18, R2-19).**
  - Game computer start screen `/desk`: Create lobby (primary; opens the TV window), Resume, Boards, Settings, Help, network troubleshooting. With a lobby open: host pairing QR (one-step pairing via `/host#pair=`), 6-digit lobby-scoped code, "Host connected" status (start screen connects as an observer), TV window controls, Close lobby.
  - One host app at `/host/*` for iPad and PC: Home, Boards, Players, Teams, Buzzers, History, Settings, Help; "Present on TV" / "Private view" switch; Back to start on the game computer. Old `/desk/*` links redirect.
  - Home: "Set up a game" (board with preview, mode, rules preset, player limit, rules draft, summary) → **Open lobby** → lobby setup with **lobby controls** (change board, Individuals/Teams with an exact warning, rules, count/limit) → Start game.
  - TV (built by a frontend subagent, reviewed here): full-screen lobby, compact lobby panel with shared-element morph, left nav rail, wordmark top-right, presented pages (leaderboard, players, player card, teams, boards, board categories, rules summary, buzzer overview). All payloads built on the server from public data.
  - Emoji in menus and controls replaced by Lucide vector icons; Help rewritten for the new flow.
  - Fixed during testing: pairing code in the URL fragment was lost when React re-ran a state initialiser (now read without side effects, removed after mount); `Card` now forwards `data-testid`; TV phone-readiness dots refresh when phones connect/disconnect.
- Tests: Vitest 107/107, Playwright 17/17 (new lobby.spec.ts: start screen → create lobby → QR pairing → present on TV / private view → lobby controls → close lobby; legacy redirects). Screenshots: test-results/screens/.
- Pushed 6fdda96.
- **Milestone E: TV presentation effects (R2-22/23/24).** Classic board intro: screens light up in a checker pattern before the round title (skip/replay via the round-intro controls; speed setting also paces auto intros); checker fill when there is no intro. Buzzers-open indicator styles (side edges, top/bottom glow, status dot, brief pulse, none) with colour, intensity, duration, persist, label. Sound cues (13) with synthesised Classic/Arcade/Soft packs, Muted, and Custom (own files, validated, local) plus per-cue switches and Test buttons. All in Settings → TV presentation (previews; optimistic, serialised saves).
- Tests: Vitest 109/109 (new tvfx.test.ts), Playwright 18/18 (practice.spec checks the reveal and dot indicator on the TV; settings test).
- Pushed 0765344.
- **Survival UI (O8):** lives are now projected to every role; hearts on the TV podiums (OUT + greyed when eliminated), on the host score bar and on the phone. Tests: Vitest 110/110, Playwright 19/19 (new survival.spec.ts).
- Pushed a2083d5.
- **UX pass (R2-25, part 1):** screenshot audit of all host pages on iPad and iPhone (WebKit). Fixed: Boards header actions overlapping the title on iPad portrait (shared PageTitleBar), duplicate host header before a game exists, start screen with no side padding on phones; consistent headers with icon buttons on Players/Teams/Themes/History. Tests: Vitest 110/110, Playwright 19/19.
- Pushed 02dea95.
- **UX pass part 2:** live game on iPhone SE/13 and iPad Mini, editor on iPad portrait. One header bar on phones during a game (navigation + TV switch in the game bar; icon-only Pause/Menu; distinct ⋮ game menu), short buzzer labels, wrapping editor category controls. Tests: Vitest 110/110, Playwright 19/19.
- Tagged **v0.4.0**.
- **Real hardware verified by the user (2026-10-13):** host pairing by scanning the lobby QR with a real iPad, the host app on a real iPad, and real Joy-Cons on Windows all work (KNOWN_ISSUES K1, K2, K19 resolved; FEATURE_MATRIX H1, H9, Z7, R2-2, R2-3 updated).
- **Joy-Con feedback (Z12):** vibration when a Joy-Con buzzes in first (one pulse) or too early (two taps), Identify (lights + pulse) and Vibrate test buttons. Fixed: Identify did nothing when pressed on the iPad (it ran locally) — controller feedback is now routed by the server to the window that reads the Joy-Con. Setting on the Buzzers page. Rumble not yet felt on hardware (K25). Tests: Vitest 114/114.
- **Buzzer check + connection quality (Z11):** Buzzers page / lobby Buzzers tab: start a 20-second check; phones show a TEST button; every phone, Joy-Con and key that presses is listed in order (+ms after the first) with each phone's round-trip delay (Good/OK/Slow) and who has not pressed yet; presses never reach the game. Phones connected are listed with their delay at any time; slow phones get a tip. Tests: Vitest 115/115, Playwright 20/20.
- **Team balancing (T11):** in a team lobby, "Make balanced teams" splits the players without a team into 2+ evenly matched teams (ratings from past games, new players average; Shuffle for another fair split; only team strength is shown). Tests: Vitest 118/118, Playwright 21/21.
- **Tournaments (O8):** Tournaments page (create with individuals/teams and placement points or total score; standings, games, finish/reopen, rename, delete keeps the games); choose the tournament in "Set up a game"; standings on the host results screen with "Show on TV"; TV standings page (leaderboard layout, public names and points only). DB migration v4 (additive). Tests: Vitest 122/122, Playwright 22/22.
- **Head to head (T10):** phone "Compare with me" on another player's page and a Compare dialog on the host's Players page: record against each other (who finished ahead), games as teammates, side-by-side games/wins/accuracy/best score/buzz speed, recent games; private statistics respected. E2E selectors made exact (the phone shows a name search once there are many profiles). Tests: Vitest 123/123, Playwright 23/23.
- **Tournaments on phones:** new Tournaments page in the phone menu (standings, your row highlighted; names and points only; follows the leaderboard setting). Tests: Vitest 123/123, Playwright 23/23.
- **Polish:** visible note when "Show on TV" is unavailable (touch screens have no tooltips), tournament hint only when one is chosen, Help covers buzzer check, Joy-Con vibration, team balancing and tournaments. Tagged **v0.5.0**. Tests: Vitest 123/123, Playwright 23/23.
- **Next:** user to feel Joy-Con vibration on hardware (K25); further ideas: TV presentation of head-to-head, tournament brackets, sound volume per cue.

## Session 3 — 2026-10-12 (roadmap continuation, auto-push workflow)

- Baseline backed up: pushed main to GitHub and tagged **v0.2.0** (Vitest 58/58, Playwright 8/8 at the time).
- **Milestone: board packages + full backups (L9, K6, K7).** Dependency-free ZIP module (src/server/zip.ts: stored/deflate, CRC checks, path-traversal/zip-bomb/encryption/ZIP64 refusal, Windows Expand/Compress-Archive interop). Board package export/import with media re-validation and URL rewriting; full backup .zip (DB + profile pictures + clue media) with restore-on-restart incl. media safety copy; database-only backup kept. Library and Settings UI updated. Fastify now force-closes connections on shutdown (an unread media download could stall app exit).
- Tests: Vitest 64/64 (new zip unit tests + package/backup integration tests); Playwright 9/9 (new library.spec.ts: UI package export → import, duplicate, archive/restore, version restore). Pushed b5cd734.
- **Milestone: custom TV themes (O5).** shared/themes.ts model (base preset + overrides), DB migration v2 (themes table, additive), /api/themes CRUD + export/import (images embedded and re-validated, only local media URLs allowed), TV applies overrides as CSS variables + value prefix + text scales + logo, live update when the active theme is edited; desk **TV themes** page with real-TV live preview (/board/preview in an iframe via postMessage). Settings now links to it.
- Tests: Vitest 65/65, Playwright 10/10 (new themes.spec.ts). Pushed c674ea9.
- **Milestone: computer opponents + practice mode (O3).** server/bots.ts BotDriver (schedules buzz/answer/Daily Wager/Final actions through the normal engine; difficulty = knowledge × value, reaction window, risk, wager style; never early; respects undo), engine addBot / hostBuzz / bot difficulty, DB migration v3 (games.practice) with statistics counting only non-practice games, host UI (practice toggle, computer-opponent dialog, answer spoiler guard, Buzz-for buttons, B shortcut), practice badges in history.
- Tests: Vitest 71/71 (bots unit tests with fake timers, practice/bot integration test), Playwright 11/11 (practice.spec.ts). Pushed 982a9b0.
- **Milestone: room codes (P17).** Optional per-game code (crypto-random, no look-alike letters), required to join when enabled, shown on TV lobby/join overlay and host setup, never in phone state, 5 wrong tries/min per connection, regenerate from host. Tests: unit, integration (hub), roomcode.spec.ts.
- **E2E hygiene:** an intermittent failure was traced to leftover browser contexts (4 live pages from the first test made later WebKit tests ~7× slower: PIN test 38 s → 5 s). All specs now close contexts after each test. Idle-page CPU was profiled at the same time (TV lobby/intro/board/clue/results, host, portal: <1% main-thread busy, no layout churn) — no app-side busy loops.
- Tests: Vitest 73/73, Playwright 12/12 (suite 2.3 min). Pushed 3921a50.
- **In progress: Survival mode (O8).** Engine done + unit-tested (rules.survivalLives, "Survival" preset, lives derived from non-voided incorrect answers, eliminated competitors cannot buzz / skip the Final / rank below survivors). **Next:** show lives (hearts) and eliminated state on TV scoreboard, host footer and phone (buzz reason "eliminated"), lives field in Rules dialog; then Tournament mode (series of games with cumulative standings — needs a tournaments table, migration v4). Vitest 74/74; E2E not re-run after this engine-only change.

## Session 2 — 2026-10-12 (user feedback round 1)

### Completed
- Feedback recorded permanently: USER_FEEDBACK.md (audit findings AF1–AF15, requirements FB-x.y with acceptance criteria), PROJECT_SPEC §43, FEATURE_MATRIX, IMPLEMENTATION_PLAN milestone 15, DECISIONS D19–D27.
- Engine: early-buzz rules (none / short lockout / out for clue / lose points), per-person lockouts, correct early classification, refunds; answering-ended state + Reveal → Return flow with stale-tap guards; category introduction state (start/next/auto/skip); old saves normalised on load.
- Server: lockout-expiry rebroadcast, intro auto-pacing, separated leaderboard groups, public player page data, host CSV exports, teardown race fixed.
- Mobile/tablet: dvh app shells, safe areas, Modal rebuilt (bounded by visible viewport, no focus stealing on live updates, scroll lock), compositor-only animations, structural sharing of live state, second-resolution timers.
- Navigation: phone portal routes /join/* with drawer, titles, back arrow, browser Back; host drawer + back arrow; responsive desktop nav.
- Phone pages: Leaderboard, Players + public player page, Game history + detailed game page, Settings split from Profile; phone buzzer armed while locked (early presses count).
- Host: early-buzz chip/list/refund, Nobody knows → Reveal answer → Return to board, intro controls, keyboard shortcuts.
- TV (frontend-agent, reviewed): classic board, clue zoom from tile + reverse, question without category/value, subtle buzzer indicator, category intro, podium scoreboard, WAAPI timer bar, polish.

### Tests (2026-10-12, session 2)
- npx tsc -p . — clean. npm run build — OK.
- npm test — 58/58 (43 unit, 15 integration), no unhandled errors.
- npm run test:e2e — 8/8 (game, PIN, offline, mobile phones ×6 configs, iPad ×3, teams/editor/Final).
- Failing: none.

### Packaging
- Version 0.2.0. `npm run dist` → release/OfflineJeopardy-Setup-0.2.0.exe and release/OfflineJeopardy-Portable-0.2.0.exe (unsigned). Packaged exe smoke-tested against a scratch data folder (server start on :3000, UI assets, CSV export).

### Git
- fe20a7f requirements record · 4d14287 engine/server · a7d95a5 UI + TV board + tests · 3921bc5 release 0.2.0.

### Not verified (needs real hardware)
- Real iPhone/iPad Safari (toolbars, notch, smoothness), real Joy-Cons after these changes (the controller path itself was not modified), TV frame rate of the zoom.

### Next recommended tasks
1. Real-device pass: iPhone + iPad Safari (portal, buzzer, host), Joy-Cons early-buzz behaviour, TV zoom smoothness in the Electron board window.
2. (done) Installer/portable 0.2.0 rebuilt and smoke-tested; run the installer on the real PC.
3. Roadmap: game-package export with media (L9), backup incl. media (K6), theme editor (O5), editor E2E (K5).

## Session 1 — 2026-10-12

### Completed milestones
- Environment verified (Node 24.21, Electron 44.7 w/ Node 24.21, `node:sqlite` in Electron, sharp, Playwright Chromium+WebKit, REA MCP server responsive).
- Six subagent definitions in `.claude/agents/` (research, backend, frontend, gameplay, qa, integration). Note: definitions created mid-session are loaded by Claude Code in the *next* session; this session used a general-purpose agent with the frontend-agent brief to build the board library + editor.
- Pure game engine (scoring, negative scores, Daily/Final wagers, timers, undo via event voiding, team attribution, unified buzzer arbitration) + role projections.
- Local server: SQLite schema/migrations, scrypt PINs + lockouts, host pairing, WebSocket hub, REST API, profile pictures, board import/export/versions, statistics/history, crash recovery, backup.
- React UIs: TV board, iPad host (picker, setup, live, final, results, event log, rules), phone portal (profiles/PIN/create, buzzer, final, stats, history, profile editing w/ photo crop), desktop dashboard (connect, library, editor, players, teams, buzzers, history, settings, help).
- Joy-Con WebHID reader + gamepad + keyboard bridge; Electron main/preload with HID permissions and TV window on any display.
- Windows packaging: `release/OfflineJeopardy-Setup-0.1.0.exe` (NSIS, ~120 MB) and `release/OfflineJeopardy-Portable-0.1.0.exe` (~120 MB). Packaged exe smoke-tested (UI served from asar, sharp upload works).

### Tests (last run 2026-10-12)
- `npx tsc -p .` — clean.
- `npm test` — 38/38 passing (25 unit, 13 integration).
- `npm run test:e2e` — 4/4 passing (full iPad/phone/TV game; PIN sign-in; offline request check; CSV import + editor edit + mixed-mode team game with shared keyboard buzzer, attribution and full Final via phone).
- Failing: none.

### Bugs found & fixed by tests
- Non-buzz Joy-Con buttons (e.g. HOME) consumed the debounce window and swallowed a real buzz.
- PIN pad cleared digits on a 300 ms timer, dropping a quick retry after a wrong PIN.
- `Field` wrapped button groups in a `<label>`, giving the first button the field's name (screen-reader bug); added `group` mode.
- Host UI flashed the game picker before the first server state arrived; now waits for the first snapshot.

### Blockers / unverified
- Real Joy-Con hardware and a real iPad not available in this session (K1, K2).

### Next recommended tasks
See IMPLEMENTATION_PLAN.md → "Next tasks". Start with real-hardware validation (Joy-Cons, iPad), then game-package export with media and the theme editor.

### Git
- c6d5a7d engine · 04d1c0e server · (this commit) web UI, Electron, packaging, docs.
