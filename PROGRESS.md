# Progress

## Session 6 — 2026-10-14 (user feedback round 4, reviewing v0.7.0)

- **Play-testing after v0.8.0 (user request: find edge cases):**
  - New seeded engine fuzzer `tests/unit/playtest.fuzz.test.ts`: random rules/modes/players/bots/teams, sensible + junk actions; invariants after every step (no crash, no answer/Final leaks to TV/phones/host, scores = events, unique lobby colours, undo restores exact scores, save/load round-trip, liveness). 300 games in CI; 3,000 run locally (`FUZZ_GAMES`).
  - **Bugs found and fixed:** (1) removing a player mid-game who had not scored yet — the buzzed-in player, the Daily Double! wagerer or a Final Jeopardy! contestant — left the host stuck (judging failed); (2) Undo could bring a removed player back into the Final reveal or as the picker; (3) Final Jeopardy! with nobody eligible had no button in the reveal stage (host stuck); (4) the phone's header picture showed the preferred colour instead of the lobby colour; (5) the Undo label overflowed the score bar on iPad portrait.
  - New browser play-test `tests/e2e/playtest.spec.ts`: iPad portrait host, 4:3 TV, three phones (colour clash), intro gating, wrong answer → auto re-open, Daily Double!, Final with a missing wager and an answer typed but never sent (autosave), reveal order, Return to Lobby, a Final nobody qualifies for; plus a TV reload during the intro (no board-fill replay). Media spec: image-only clue complete in the editor.
  - Tests: Vitest 155/155, Playwright 29/29.
  - Soak play-test `tests/integration/soak.test.ts` (six phones pressing at once, drop-outs/reconnects mid-clue, Final via phones, three Return-to-Lobby cycles; host/TV/phones always agree; stats counted once). It showed that all host and input-bridge messages share the 120/s phone flood limit — mashing several Joy-Cons could lose a button release. Trusted host/bridge connections now allow 2,000/s and a dropped host action gets an error reply.
  - Screen play-tests: profile creation on iPhone SE, sound packs on iPad portrait — fixed the "Jeopardy!/Buzzinga (Default)" title overflowing its card.
  - Tests: Vitest 156/156, Playwright 30/30.

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
