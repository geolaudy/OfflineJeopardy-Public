# Progress

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
- **Next:** tournament mode; latency diagnostics; real-device checks (iPad Safari, Joy-Con) remain manual.

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
